import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { envelopeSchema, type Envelope } from './crypto';
import { validatePublicConfig } from './public-config';
let client: SupabaseClient | undefined;
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
export function supabase() {
  if (!configured())
    throw new Error('Supabase setup is required. Try the synthetic demo.');
  validatePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return (client ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  ));
}
export async function requireOwnerSession() {
  const db = supabase();
  const { data: user, error } = await db.auth.getUser();
  if (error || !user.user) throw new Error('Please sign in.');
  const { data, error: assuranceError } =
    await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || data?.currentLevel !== 'aal2')
    throw new Error('Verify your authenticator code first.');
  const { data: allowed, error: accessError } = await db.rpc('owner_access');
  if (accessError || allowed !== true)
    throw new Error('This identity is not the configured owner.');
  return user.user.id;
}
export async function loadVault() {
  const id = await requireOwnerSession();
  const { data, error } = await supabase()
    .from('vaults')
    .select('payload,version')
    .eq('owner_id', id)
    .maybeSingle();
  if (error)
    throw new Error(
      'Could not load the encrypted vault. Check Supabase setup.',
    );
  if (data && (!Number.isSafeInteger(data.version) || data.version < 1))
    throw new Error('Invalid vault version.');
  return data
    ? {
        envelope: envelopeSchema.parse(data.payload),
        version: data.version as number,
      }
    : null;
}
export async function saveVault(envelope: Envelope, expectedVersion: number) {
  const checked = envelopeSchema.parse(envelope);
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 0 ||
    expectedVersion >= 2147483647
  )
    throw new Error('Invalid vault version.');
  await requireOwnerSession();
  const { data, error } = await supabase().rpc('save_vault', {
    encrypted_payload: checked,
    expected_version: expectedVersion,
  });
  if (error)
    throw new Error(
      error.message.includes('VERSION_CONFLICT')
        ? 'Another device changed the vault. Lock and unlock to load its latest version before trying again. Your unsaved change was not written.'
        : 'Encrypted save failed. Your change was not saved. Check your connection and access.',
    );
  if (!Number.isSafeInteger(data) || data !== expectedVersion + 1)
    throw new Error('Invalid server version.');
  return data as number;
}
