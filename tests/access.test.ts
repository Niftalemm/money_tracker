import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createVault } from '../src/lib/crypto';
import { emptyState } from '../src/lib/model';
const owner = '11111111-1111-4111-8111-111111111111',
  other = '22222222-2222-4222-8222-222222222222';
let db: PGlite, payload: unknown;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${owner}'), ('${other}');`);
  await db.exec(
    readFileSync(
      new URL(
        '../supabase/migrations/202610040001_encrypted_vault.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  await db.exec(`insert into private.owner(user_id) values ('${owner}')`);
  payload = (await createVault('synthetic access test secret', emptyState()))
    .envelope;
});
afterAll(async () => {
  await db.close();
});
async function identity(
  role: 'anon' | 'authenticated',
  sub?: string,
  aal = 'aal2',
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub, aal }),
  ]);
  await db.exec(`set role ${role}`);
}
describe('actual migration authorization and optimistic concurrency', () => {
  it('rejects unauthenticated data reads and writes', async () => {
    await identity('anon');
    await expect(db.query('select * from public.vaults')).rejects.toThrow(
      'permission denied',
    );
    await expect(
      db.query('select public.save_vault($1,0)', [payload]),
    ).rejects.toThrow('permission denied');
  });
  it('rejects an authenticated second user, even with MFA', async () => {
    await identity('authenticated', other);
    expect(
      (
        await db.query<{ owner_access: boolean }>(
          'select public.owner_access()',
        )
      ).rows[0].owner_access,
    ).toBe(false);
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      0,
    );
    await expect(
      db.query('select public.save_vault($1,0)', [payload]),
    ).rejects.toThrow('NOT_AUTHORIZED');
    await expect(db.query('select * from private.owner')).rejects.toThrow(
      'permission denied',
    );
  });
  it('rejects the owner without MFA', async () => {
    await identity('authenticated', owner, 'aal1');
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      0,
    );
    await expect(
      db.query('select public.save_vault($1,0)', [payload]),
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
  it('permits the owner at AAL2, only through the checked save function', async () => {
    await identity('authenticated', owner);
    const result = await db.query<{ save_vault: number }>(
      'select public.save_vault($1,0)',
      [payload],
    );
    expect(result.rows[0].save_vault).toBe(1);
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      1,
    );
    await expect(
      db.query('update public.vaults set version=4'),
    ).rejects.toThrow('permission denied');
  });
  it('prevents silent phone/computer overwrites, including duplicate initialization', async () => {
    await identity('authenticated', owner);
    await expect(
      db.query('select public.save_vault($1,0)', [payload]),
    ).rejects.toThrow('VERSION_CONFLICT');
    expect(
      (
        await db.query<{ save_vault: number }>(
          'select public.save_vault($1,1)',
          [payload],
        )
      ).rows[0].save_vault,
    ).toBe(2);
    await expect(
      db.query('select public.save_vault($1,1)', [payload]),
    ).rejects.toThrow('VERSION_CONFLICT');
  });
  it('rejects financial plaintext and extra payload fields', async () => {
    await identity('authenticated', owner);
    await expect(
      db.query('select public.save_vault($1,2)', [
        { ...(payload as object), transactions: ['private plaintext'] },
      ]),
    ).rejects.toThrow('INVALID_ENCRYPTED_PAYLOAD');
    await expect(
      db.query('select public.save_vault($1,2)', [{ transactions: [] }]),
    ).rejects.toThrow();
  });
  it('RLS still hides an existing vault from the second account', async () => {
    await identity('authenticated', other);
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      0,
    );
  });
});
