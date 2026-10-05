// Public browser configuration must never contain an administrator credential.
export function validatePublicConfig(url: string, key: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid public Supabase URL.');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== 'https:' &&
      !(
        parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(parsed.hostname)
      ))
  )
    throw new Error(
      'Use a Supabase project URL without credentials or extra paths.',
    );
  if (key.startsWith('sb_publishable_')) return;
  if (key.startsWith('sb_secret_'))
    throw new Error(
      'Administrator keys are forbidden in public configuration.',
    );
  try {
    const parts = key.split('.');
    if (parts.length !== 3) throw new Error();
    const role = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    ).role;
    if (role !== 'anon') throw new Error();
  } catch {
    throw new Error('Use only a Supabase publishable key or legacy anon key.');
  }
}
