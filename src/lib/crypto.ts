import { z } from 'zod';
import { stateSchema, type TrackerState } from './model';
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const bytes = (length: number) =>
  crypto.getRandomValues(new Uint8Array(length));
const b64 = (buffer: ArrayBuffer | Uint8Array) => {
  let text = '';
  for (const n of new Uint8Array(buffer)) text += String.fromCharCode(n);
  return btoa(text);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const boxSchema = z
  .object({
    iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
    ciphertext: z
      .string()
      .min(24)
      .max(20_000_000)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  })
  .strict();
const wrappedSchema = boxSchema.extend({
  ciphertext: z.string().regex(/^[A-Za-z0-9+/]{64}$/),
});
export const envelopeSchema = z
  .object({
    format: z.literal('money-tracker-v1'),
    salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    iterations: z.literal(ITERATIONS),
    wrappedKey: wrappedSchema,
    recoveryWrappedKey: wrappedSchema,
    data: boxSchema,
  })
  .strict()
  .refine(
    (e) => JSON.stringify(e).length <= 20_000_000,
    'Encrypted backup is too large.',
  );
export type Box = z.infer<typeof boxSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
const aad = (purpose: string) => encoder.encode('money-tracker-v1:' + purpose);
async function seal(
  key: CryptoKey,
  value: Uint8Array,
  purpose: string,
): Promise<Box> {
  const iv = bytes(12);
  return {
    iv: b64(iv),
    ciphertext: b64(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad(purpose) },
        key,
        value as BufferSource,
      ),
    ),
  };
}
async function open(key: CryptoKey, box: Box, purpose: string) {
  const iv = unb64(box.iv);
  if (iv.length !== 12) throw new Error('Invalid encrypted data');
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad(purpose) },
      key,
      unb64(box.ciphertext),
    ),
  );
}
async function passwordKey(secret: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS,
      salt: salt as BufferSource,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
const importKey = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
export async function createVault(secret: string, state: TrackerState) {
  if (secret.length < 14)
    throw new Error('Use an unlock secret with at least 14 characters.');
  const raw = bytes(32),
    salt = bytes(16),
    recoveryRaw = bytes(32);
  try {
    const key = await importKey(raw);
    const envelope: Envelope = {
      format: 'money-tracker-v1',
      iterations: ITERATIONS,
      salt: b64(salt),
      wrappedKey: await seal(
        await passwordKey(secret, salt),
        raw,
        'password-key',
      ),
      recoveryWrappedKey: await seal(
        await importKey(recoveryRaw),
        raw,
        'recovery-key',
      ),
      data: await seal(
        key,
        encoder.encode(JSON.stringify(stateSchema.parse(state))),
        'records',
      ),
    };
    const recovery = Array.from(recoveryRaw, (n) =>
      n.toString(16).padStart(2, '0'),
    )
      .join('')
      .match(/.{1,8}/g)!
      .join('-');
    return { key, envelope, recovery };
  } finally {
    raw.fill(0);
    recoveryRaw.fill(0);
  }
}
export async function unlockVault(
  input: unknown,
  secret: string,
  recovery = false,
) {
  const envelope = envelopeSchema.parse(input);
  let wrapping: CryptoKey;
  if (recovery) {
    const hex = secret.replace(/[-\s]/g, '');
    if (!/^[a-fA-F0-9]{64}$/.test(hex))
      throw new Error('Recovery key must have 64 hexadecimal characters.');
    const raw = Uint8Array.from(hex.match(/../g)!, (s) => parseInt(s, 16));
    try {
      wrapping = await importKey(raw);
    } finally {
      raw.fill(0);
    }
  } else wrapping = await passwordKey(secret, unb64(envelope.salt));
  const raw = await open(
    wrapping,
    recovery ? envelope.recoveryWrappedKey : envelope.wrappedKey,
    recovery ? 'recovery-key' : 'password-key',
  );
  let key: CryptoKey;
  try {
    key = await importKey(raw);
  } finally {
    raw.fill(0);
  }
  const state = await decryptState(envelope, key);
  return { key, state, envelope };
}
export async function decryptState(input: unknown, key: CryptoKey) {
  const envelope = envelopeSchema.parse(input);
  const plaintext = await open(key, envelope.data, 'records');
  try {
    return stateSchema.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  } finally {
    plaintext.fill(0);
  }
}
export async function encryptState(
  envelope: Envelope,
  key: CryptoKey,
  state: TrackerState,
): Promise<Envelope> {
  return {
    ...envelope,
    data: await seal(
      key,
      encoder.encode(JSON.stringify(stateSchema.parse(state))),
      'records',
    ),
  };
}
