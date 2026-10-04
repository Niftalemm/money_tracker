import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validatePublicConfig } from '../src/lib/public-config';
const fake = vi.hoisted(() => {
  const getUser = vi.fn(),
    assurance = vi.fn(),
    rpc = vi.fn(),
    read = vi.fn();
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: read };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return {
    getUser,
    assurance,
    rpc,
    read,
    chain,
    client: {
      auth: { getUser, mfa: { getAuthenticatorAssuranceLevel: assurance } },
      rpc,
      from: vi.fn(() => chain),
    },
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fake.client }));
import { loadVault, saveVault } from '../src/lib/storage';
const envelope = {
  format: 'money-tracker-v1' as const,
  iterations: 600000 as const,
  salt: 'A'.repeat(22) + '==',
  wrappedKey: { iv: 'A'.repeat(16), ciphertext: 'A'.repeat(64) },
  recoveryWrappedKey: { iv: 'A'.repeat(16), ciphertext: 'A'.repeat(64) },
  data: { iv: 'A'.repeat(16), ciphertext: 'A'.repeat(24) },
};
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_synthetic';
  fake.getUser.mockResolvedValue({
    data: { user: { id: 'fake-owner' } },
    error: null,
  });
  fake.assurance.mockResolvedValue({
    data: { currentLevel: 'aal2' },
    error: null,
  });
  fake.rpc.mockImplementation(async (name: string) => ({
    data: name === 'owner_access' ? true : 1,
    error: null,
  }));
  fake.read.mockResolvedValue({
    data: { payload: envelope, version: 1 },
    error: null,
  });
});
describe('every cloud operation checks identity, MFA, and the database owner boundary', () => {
  it.each(['read', 'write'] as const)(
    'rejects missing authentication before %s',
    async (op) => {
      fake.getUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(
        op === 'read' ? loadVault() : saveVault(envelope, 0),
      ).rejects.toThrow('sign in');
      expect(fake.read).not.toHaveBeenCalled();
      expect(fake.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(['aal1', 'aal2-other-owner'])(
    'rejects %s before reading or saving',
    async (mode) => {
      if (mode === 'aal1')
        fake.assurance.mockResolvedValue({
          data: { currentLevel: 'aal1' },
          error: null,
        });
      else fake.rpc.mockResolvedValue({ data: false, error: null });
      await expect(loadVault()).rejects.toThrow();
      await expect(saveVault(envelope, 0)).rejects.toThrow();
      expect(fake.read).not.toHaveBeenCalled();
      expect(
        fake.rpc.mock.calls.filter((c) => c[0] === 'save_vault'),
      ).toHaveLength(0);
    },
  );
  it('rechecks all gates on successive operations and sends only checked ciphertext', async () => {
    await loadVault();
    await saveVault(envelope, 0);
    expect(fake.getUser).toHaveBeenCalledTimes(2);
    expect(fake.assurance).toHaveBeenCalledTimes(2);
    expect(fake.chain.eq).toHaveBeenCalledWith('owner_id', 'fake-owner');
    expect(fake.rpc).toHaveBeenCalledWith('save_vault', {
      encrypted_payload: envelope,
      expected_version: 0,
    });
    fake.assurance.mockResolvedValue({
      data: { currentLevel: 'aal1' },
      error: null,
    });
    await expect(saveVault(envelope, 1)).rejects.toThrow('authenticator');
  });
  it('does not accept malformed version responses or silent conflicts', async () => {
    fake.rpc.mockImplementation(async (name: string) =>
      name === 'owner_access'
        ? { data: true, error: null }
        : { data: null, error: { message: 'VERSION_CONFLICT' } },
    );
    await expect(saveVault(envelope, 1)).rejects.toThrow('Another device');
    fake.read.mockResolvedValue({
      data: { payload: envelope, version: -1 },
      error: null,
    });
    await expect(loadVault()).rejects.toThrow('version');
  });
});
it('forbids administrator credentials and credential-bearing URLs in browser config', () => {
  expect(() =>
    validatePublicConfig('https://fake.supabase.co', 'sb_secret_fake'),
  ).toThrow('Administrator');
  const jwt = (role: string) =>
    'header.' + btoa(JSON.stringify({ role })) + '.signature';
  expect(() =>
    validatePublicConfig('https://fake.supabase.co', jwt('service_role')),
  ).toThrow('publishable');
  expect(() =>
    validatePublicConfig('https://fake.supabase.co', jwt('anon')),
  ).not.toThrow();
  expect(() =>
    validatePublicConfig(
      'https://user:password@fake.supabase.co',
      'sb_publishable_fake',
    ),
  ).toThrow();
  expect(() => validatePublicConfig('invalid', 'sb_publishable_fake')).toThrow(
    'Invalid public',
  );
});
