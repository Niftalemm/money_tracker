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
  await db.exec(
    readFileSync(
      new URL(
        '../supabase/migrations/202610040002_security_hardening.sql',
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
  it('strictly validates nested ciphertext shapes and JSON value types', async () => {
    await identity('authenticated', owner);
    for (const patch of [
      { iterations: '600000' },
      { salt: null },
      { data: null },
      { wrappedKey: { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA' } },
      { data: { iv: 123, ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAA' } },
    ]) {
      await expect(
        db.query('select public.save_vault($1,2)', [
          { ...(payload as object), ...patch },
        ]),
      ).rejects.toThrow();
    }
    expect(
      (await db.query<{ version: number }>('select version from public.vaults'))
        .rows[0].version,
    ).toBe(2);
  });
  it('RLS and trigger still enforce MFA and ownership if a write grant is accidentally added', async () => {
    await db.exec(
      'reset role; grant insert,update on public.vaults to authenticated;',
    );
    try {
      await identity('authenticated', other);
      await expect(
        db.query(
          'insert into public.vaults(owner_id,payload,version) values($1,$2,1)',
          [other, payload],
        ),
      ).rejects.toThrow('NOT_AUTHORIZED');
      await identity('authenticated', owner, 'aal1');
      expect(
        (
          await db.query(
            'update public.vaults set version=version+1 returning version',
          )
        ).rows,
      ).toHaveLength(0);
      await expect(
        db.query(
          'insert into public.vaults(owner_id,payload,version) values($1,$2,1)',
          [owner, payload],
        ),
      ).rejects.toThrow('NOT_AUTHORIZED');
      await identity('authenticated', owner);
      await expect(
        db.query('update public.vaults set version=99'),
      ).rejects.toThrow('INVALID_VERSION');
      await expect(
        db.query(
          'insert into public.vaults(owner_id,payload,version) values($1,$2,1)',
          [other, payload],
        ),
      ).rejects.toThrow('NOT_AUTHORIZED');
    } finally {
      await db.exec(
        'reset role; revoke insert,update on public.vaults from authenticated;',
      );
    }
  });
  it('an existing vault stays hidden after the owner loses AAL2', async () => {
    await identity('authenticated', owner, 'aal1');
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      0,
    );
    await expect(
      db.query('select public.save_vault($1,2)', [payload]),
    ).rejects.toThrow('NOT_AUTHORIZED');
  });
  it('RLS still hides an existing vault from the second account', async () => {
    await identity('authenticated', other);
    expect((await db.query('select * from public.vaults')).rows).toHaveLength(
      0,
    );
  });
  it('only one of two competing device saves can advance the same version', async () => {
    await identity('authenticated', owner);
    const results = await Promise.allSettled([
      db.query('select public.save_vault($1,2)', [payload]),
      db.query('select public.save_vault($1,2)', [payload]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const failed = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(String(failed.reason)).toContain('VERSION_CONFLICT');
    expect(
      (await db.query<{ version: number }>('select version from public.vaults'))
        .rows[0].version,
    ).toBe(3);
  });
});
