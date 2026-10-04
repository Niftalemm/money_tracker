'use client';
import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Wallet, ArrowRight } from 'lucide-react';
import { configured, loadVault, saveVault, supabase } from '@/lib/storage';
import {
  createVault,
  encryptState,
  unlockVault,
  type Envelope,
} from '@/lib/crypto';
import { emptyState, stateSchema, type TrackerState } from '@/lib/model';
import { demoState } from '@/lib/demo';
import { download } from '@/lib/exports';
type Context = {
  state: TrackerState;
  demo: boolean;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  lock: () => void;
  backup: () => void;
  restore: (
    envelope: Envelope,
    key: CryptoKey,
    state: TrackerState,
  ) => Promise<void>;
};
export default function AuthGate({
  children,
}: {
  children: (context: Context) => React.ReactNode;
}) {
  const [phase, setPhase] = useState<
    'login' | 'mfa' | 'unlock' | 'create' | 'recovery' | 'open'
  >('login');
  const [state, setState] = useState<TrackerState | null>(null),
    [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [secret, setSecret] = useState(''),
    [recoveryMode, setRecoveryMode] = useState(false),
    [recovery, setRecovery] = useState('');
  const [code, setCode] = useState(''),
    [factorId, setFactorId] = useState(''),
    [qr, setQr] = useState('');
  const vault = useRef<{
      envelope: Envelope;
      key?: CryptoKey;
      version: number;
    } | null>(null),
    saving = useRef(false),
    generation = useRef(0);
  function lock() {
    generation.current++;
    vault.current = null;
    saving.current = false;
    setState(null);
    setSecret('');
    setRecovery('');
    setPassword('');
    setCode('');
    setQr('');
    setDemo(false);
    setBusy(false);
    setError('');
    setPhase('login');
    if (configured()) void supabase().auth.signOut({ scope: 'local' });
  }
  useEffect(() => {
    if (phase !== 'open' && phase !== 'recovery') return;
    let timer: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();
    const check = () => {
      if (Date.now() - lastActivity >= 10 * 60 * 1000) lock();
    };
    const reset = () => {
      lastActivity = Date.now();
      clearTimeout(timer);
      timer = setTimeout(check, 10 * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((name) => window.addEventListener(name, reset));
    reset();
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      events.forEach((name) => window.removeEventListener(name, reset));
      document.removeEventListener('visibilitychange', check);
    };
  }, [phase]);
  useEffect(() => {
    if (!configured()) return;
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        generation.current++;
        vault.current = null;
        setState(null);
        setPhase('login');
        setSecret('');
        setRecovery('');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function action(fn: (token: number) => Promise<void>) {
    if (saving.current) return;
    const token = generation.current;
    setBusy(true);
    setError('');
    try {
      await fn(token);
    } catch {
      if (token === generation.current)
        setError(
          'Unable to continue. Check your credentials, recovery key, connection, or Supabase setup.',
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  async function afterAuth(token: number) {
    const data = await loadVault();
    if (token !== generation.current) return;
    vault.current = data
      ? { envelope: data.envelope, version: data.version }
      : null;
    setPhase(data ? 'unlock' : 'create');
    setQr('');
  }
  async function login(token: number) {
    const pass = password;
    setPassword('');
    const { error } = await supabase().auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
    if (token !== generation.current) return;
    const { data, error: factorError } =
      await supabase().auth.mfa.listFactors();
    if (factorError) throw factorError;
    if (token !== generation.current) return;
    const factor = data.totp.find((f) => f.status === 'verified');
    if (factor) setFactorId(factor.id);
    else {
      const { data: enrollment, error: enrollError } =
        await supabase().auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Money Tracker owner',
        });
      if (enrollError) throw enrollError;
      if (token !== generation.current) return;
      setFactorId(enrollment.id);
      setQr(enrollment.totp.qr_code);
    }
    setPhase('mfa');
  }
  async function save(next: TrackerState) {
    if (saving.current) throw new Error('Wait for the current encrypted save.');
    const clean = stateSchema.parse({
      ...next,
      updatedAt: new Date().toISOString(),
    });
    if (demo) {
      setState(clean);
      return;
    }
    const current = vault.current,
      token = generation.current;
    if (!current?.key) throw new Error('Unlock the vault first.');
    saving.current = true;
    setBusy(true);
    try {
      const envelope = await encryptState(current.envelope, current.key, clean);
      const version = await saveVault(envelope, current.version);
      if (token !== generation.current) return;
      vault.current = { ...current, envelope, version };
      setState(clean);
    } finally {
      if (token === generation.current) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  async function restore(
    envelope: Envelope,
    key: CryptoKey,
    restored: TrackerState,
  ) {
    if (saving.current) throw new Error('Wait for the current save.');
    if (demo) {
      setState(restored);
      return;
    }
    if (!vault.current?.key) throw new Error('Unlock first.');
    const versionBefore = vault.current.version,
      token = generation.current;
    saving.current = true;
    setBusy(true);
    try {
      const version = await saveVault(envelope, versionBefore);
      if (token === generation.current) {
        vault.current = { envelope, key, version };
        setState(restored);
      }
    } finally {
      if (token === generation.current) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  if (phase === 'open' && state)
    return (
      <>
        {children({
          state,
          demo,
          busy,
          save,
          lock,
          restore,
          backup: () => {
            if (demo)
              throw new Error(
                'Encrypted backup requires a real unlocked vault; the demo has no encryption key.',
              );
            if (!vault.current) throw new Error('Unlock first.');
            download(
              new Blob([JSON.stringify(vault.current.envelope)], {
                type: 'application/json',
              }),
              'money-tracker.encrypted.json',
            );
          },
        })}
      </>
    );
  return (
    <main className="welcome">
      <div className="welcome-brand">
        <span className="brand-mark">
          <Wallet size={22} />
        </span>{' '}
        money tracker
      </div>
      <div className="welcome-grid">
        <section>
          <p className="eyebrow">A LITTLE CLARITY, EVERY MONTH</p>
          <h1>
            Your money.
            <br />
            The whole picture.
          </h1>
          <p className="intro">
            One quiet place for Amex, Bank of America, and Capital One. See the
            details. Know where you stand.
          </p>
          <div className="welcome-note">
            <ShieldCheck size={22} />
            <p>
              Records are encrypted on your device.
              <br />
              <span>Your unlock secret stays with you.</span>
            </p>
          </div>
        </section>
        <section className="auth-card">
          <h2>
            {phase === 'login'
              ? 'Welcome to your tracker'
              : phase === 'mfa'
                ? 'Verify your identity'
                : phase === 'unlock'
                  ? 'Unlock your records'
                  : phase === 'create'
                    ? 'Create your private vault'
                    : 'Keep your recovery key safe'}
          </h2>
          <p className="muted">
            {phase === 'login'
              ? 'Start with the synthetic demo, or sign in after Supabase is configured.'
              : phase === 'mfa'
                ? 'MFA is required for every cloud data operation.'
                : phase === 'unlock'
                  ? 'Your login password and your unlock secret are separate.'
                  : 'If you lose both your unlock secret and recovery key, your records cannot be recovered.'}
          </p>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          {phase === 'login' && (
            <>
              <button
                className="primary full"
                onClick={() => {
                  generation.current++;
                  setDemo(true);
                  setState(demoState());
                  setPhase('open');
                }}
              >
                Try with fake data <ArrowRight size={17} />
              </button>
              <div className="divider">OWNER SIGN IN</div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(login);
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Login password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button
                  className="secondary full"
                  disabled={busy || !configured()}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              {!configured() && (
                <p className="small muted">
                  Cloud storage is not configured. See the repository setup
                  guide. The demo stays in memory.
                </p>
              )}
            </>
          )}
          {phase === 'mfa' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async (token) => {
                  const { error } =
                    await supabase().auth.mfa.challengeAndVerify({
                      factorId,
                      code,
                    });
                  if (token !== generation.current) return;
                  setCode('');
                  if (error) throw error;
                  await afterAuth(token);
                });
              }}
            >
              {qr && (
                <>
                  <p>
                    Scan with your authenticator to enroll the owner account.
                  </p>
                  <img
                    src={qr}
                    width="180"
                    height="180"
                    alt="Authenticator enrollment QR code"
                  />
                </>
              )}
              <label>
                Authenticator code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button className="primary full" disabled={busy}>
                Verify
              </button>
            </form>
          )}
          {(phase === 'unlock' || phase === 'create') && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = secret;
                setSecret('');
                void action(async (token) => {
                  if (phase === 'unlock') {
                    const result = await unlockVault(
                      vault.current!.envelope,
                      value,
                      recoveryMode,
                    );
                    if (token !== generation.current) return;
                    vault.current = { ...vault.current!, key: result.key };
                    setState(result.state);
                    setPhase('open');
                  } else {
                    const result = await createVault(value, emptyState());
                    if (token !== generation.current) return;
                    vault.current = {
                      envelope: result.envelope,
                      key: result.key,
                      version: 0,
                    };
                    setRecovery(result.recovery);
                    setPhase('recovery');
                  }
                });
              }}
            >
              <label>
                {recoveryMode && phase === 'unlock'
                  ? 'Offline recovery key'
                  : 'Unlock secret'}
                <input
                  type="password"
                  autoComplete="off"
                  minLength={phase === 'create' ? 14 : undefined}
                  required
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
              {phase === 'create' && (
                <p className="small muted">
                  Use at least 14 characters. Choose a long, unique passphrase.
                </p>
              )}
              {phase === 'unlock' && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={recoveryMode}
                    onChange={(e) => setRecoveryMode(e.target.checked)}
                  />
                  Use my offline recovery key
                </label>
              )}
              <button className="primary full" disabled={busy}>
                {busy
                  ? 'Working…'
                  : phase === 'unlock'
                    ? 'Unlock'
                    : 'Create vault'}
              </button>
            </form>
          )}
          {phase === 'recovery' && (
            <>
              <code className="recovery-key">{recovery}</code>
              <button
                className="secondary full"
                onClick={() =>
                  download(
                    new Blob([recovery], { type: 'text/plain' }),
                    'money-tracker-recovery-key.txt',
                  )
                }
              >
                Download offline recovery key
              </button>
              <p className="small muted">
                Store this away from the app and your account password.
              </p>
              <button
                className="primary full"
                disabled={busy}
                onClick={() =>
                  void action(async (token) => {
                    const v = vault.current!;
                    await unlockVault(v.envelope, recovery, true);
                    if (token !== generation.current) return;
                    const version = await saveVault(v.envelope, 0);
                    if (token !== generation.current) return;
                    vault.current = { ...v, version };
                    setState(emptyState());
                    setRecovery('');
                    setPhase('open');
                  })
                }
              >
                I saved the key · verify recovery &amp; continue
              </button>
            </>
          )}
          {phase !== 'login' && (
            <button className="text-button full" onClick={lock}>
              Back to sign in
            </button>
          )}
        </section>
      </div>
      <p className="welcome-footer">
        USD · America/New_York · Tracking from September 2026
      </p>
    </main>
  );
}
