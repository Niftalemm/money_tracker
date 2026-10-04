import { describe, expect, it } from 'vitest';
import { createVault, encryptState, unlockVault } from '../src/lib/crypto';
import { demoState } from '../src/lib/demo';
describe('authenticated browser encryption and backup recovery', () => {
  it('stores only ciphertext and restores all state with password and offline recovery', async () => {
    const state = demoState(),
      pass = 'synthetic test passphrase only';
    const { key, envelope, recovery } = await createVault(pass, state);
    const cloudPayload = JSON.stringify(envelope);
    expect(cloudPayload).not.toContain('Fresh Market');
    expect(cloudPayload).not.toContain('Amex');
    expect(cloudPayload).not.toContain(pass);
    expect(cloudPayload).not.toContain(recovery);
    expect((await unlockVault(JSON.parse(cloudPayload), pass)).state).toEqual(
      state,
    );
    expect(
      (await unlockVault(JSON.parse(cloudPayload), recovery, true)).state,
    ).toEqual(state);
    const updated = await encryptState(envelope, key, state);
    expect(updated.data.iv).not.toBe(envelope.data.iv);
    expect(updated.data.ciphertext).not.toBe(envelope.data.ciphertext);
    await expect(unlockVault(envelope, 'wrong password')).rejects.toThrow();
    const corrupted = structuredClone(envelope);
    corrupted.data.ciphertext =
      (corrupted.data.ciphertext[0] === 'A' ? 'B' : 'A') +
      corrupted.data.ciphertext.slice(1);
    await expect(unlockVault(corrupted, pass)).rejects.toThrow();
    const invalid = structuredClone(envelope);
    invalid.iterations = 1 as 600000;
    await expect(unlockVault(invalid, pass)).rejects.toThrow();
  });
  it('does not accept a weak unlock secret', async () =>
    await expect(createVault('short', demoState())).rejects.toThrow('14'));
});

it('recovery cannot be bypassed by a new login password or tampered wrappers', async () => {
  const state = demoState(),
    pass = 'synthetic independent unlock secret';
  const { envelope, key, recovery } = await createVault(pass, state);
  expect(key.extractable).toBe(false);
  await expect(
    unlockVault(envelope, 'synthetic reset login password'),
  ).rejects.toThrow();
  await expect(unlockVault(envelope, '00'.repeat(32), true)).rejects.toThrow();
  for (const field of ['wrappedKey', 'recoveryWrappedKey', 'data'] as const) {
    const bad = structuredClone(envelope);
    bad[field].iv =
      (bad[field].iv[0] === 'A' ? 'B' : 'A') + bad[field].iv.slice(1);
    await expect(
      unlockVault(
        bad,
        field === 'recoveryWrappedKey' ? recovery : pass,
        field === 'recoveryWrappedKey',
      ),
    ).rejects.toThrow();
  }
  const swapped = structuredClone(envelope);
  swapped.wrappedKey = swapped.recoveryWrappedKey;
  await expect(
    unlockVault(swapped, recovery, true).then((result) =>
      unlockVault(
        { ...result.envelope, recoveryWrappedKey: envelope.wrappedKey },
        recovery,
        true,
      ),
    ),
  ).rejects.toThrow();
  const restored = await unlockVault(
    JSON.parse(JSON.stringify(envelope)),
    recovery,
    true,
  );
  expect(restored.state).toEqual(state);
  expect(restored.state.preferences).toEqual(state.preferences);
  const changed = await encryptState(restored.envelope, restored.key, {
    ...restored.state,
    updatedAt: new Date().toISOString(),
  });
  expect((await unlockVault(changed, pass)).state.transactions).toEqual(
    state.transactions,
  );
});
