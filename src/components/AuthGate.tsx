'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Download,
  KeyRound,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import Brand from './Brand';
import { Notice, Spinner } from './ui';
import { configured, loadVault, saveVault, supabase } from '@/lib/storage';
import {
  createVault,
  decryptState,
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
  restore: (envelope: Envelope, key: CryptoKey) => Promise<void>;
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
      if (Date.now() - lastActivity >= 10 * 60 * 1000) {
        lock();
        return;
      }
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
    return () => {
      generation.current++;
      vault.current = null;
      saving.current = false;
    };
  }, []);
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
        setPassword('');
        setCode('');
        setQr('');
        setBusy(false);
        saving.current = false;
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
      if (token !== generation.current) return;
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
  async function restore(envelope: Envelope, key: CryptoKey) {
    if (saving.current) throw new Error('Wait for the current save.');
    if (!demo && !vault.current?.key) throw new Error('Unlock first.');
    const token = generation.current,
      versionBefore = vault.current?.version ?? 0;
    saving.current = true;
    setBusy(true);
    try {
      const verifiedState = await decryptState(envelope, key);
      if (token !== generation.current)
        throw new Error('The workspace locked during verification.');
      if (demo) {
        setState(verifiedState);
        return;
      }
      const version = await saveVault(envelope, versionBefore);
      if (token === generation.current) {
        vault.current = { envelope, key, version };
        setState(verifiedState);
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
  const stepIndex =
    phase === 'login' ? 0 : phase === 'mfa' ? 1 : phase === 'recovery' ? 3 : 2;
  return (
    <main className="welcome">
      <section className="welcome-hero">
        <Brand />
        <div className="welcome-copy">
          <p className="welcome-kicker">Private expense tracking</p>
          <h1>
            Your money.
            <br />
            The whole picture.
          </h1>
          <p className="intro">
            One calm place for Amex, Bank of America, and Capital One. See the
            details. Know where you stand.
          </p>
          <ul className="welcome-points">
            <li>
              <ShieldCheck size={18} aria-hidden />
              <span>
                <strong>Owner-only, with MFA</strong>
                Every cloud read and write requires your verified authenticator.
              </span>
            </li>
            <li>
              <Cpu size={18} aria-hidden />
              <span>
                <strong>Statements stay on this device</strong>
                PDFs are parsed locally. Records are encrypted before upload.
              </span>
            </li>
            <li>
              <Timer size={18} aria-hidden />
              <span>
                <strong>Locks itself</strong>
                Keys live only in memory and clear after 10 minutes idle.
              </span>
            </li>
          </ul>
        </div>
      </section>
      <section className="welcome-panel">
        <div className="auth-card">
          {phase !== 'login' && (
            <ol className="auth-steps" aria-label="Sign-in progress">
              {[
                'Sign in',
                'Verify',
                phase === 'unlock' ? 'Unlock' : 'Create vault',
                'Recovery key',
              ]
                .slice(0, phase === 'recovery' || phase === 'create' ? 4 : 3)
                .map((label, i) => (
                  <li
                    key={label}
                    className={
                      i === stepIndex ? 'current' : i < stepIndex ? 'done' : ''
                    }
                    aria-current={i === stepIndex ? 'step' : undefined}
                  >
                    {label}
                  </li>
                ))}
            </ol>
          )}
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
          <p className="auth-lead">
            {phase === 'login'
              ? 'Start with the synthetic demo, or sign in after Supabase is configured.'
              : phase === 'mfa'
                ? 'MFA is required for every cloud data operation.'
                : phase === 'unlock'
                  ? 'Your login password and your unlock secret are separate.'
                  : 'If you lose both your unlock secret and recovery key, your records cannot be recovered.'}
          </p>
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
          {phase === 'login' && (
            <>
              <button
                type="button"
                className="primary full large"
                onClick={() => {
                  generation.current++;
                  setDemo(true);
                  setState(demoState());
                  setPhase('open');
                }}
              >
                Try with fake data <ArrowRight size={17} aria-hidden />
              </button>
              <p className="fine-print center">
                Synthetic records only. Nothing is saved or sent anywhere.
              </p>
              <div className="divider">
                <span>Owner sign in</span>
              </div>
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
                  className="secondary full large"
                  disabled={busy || !configured()}
                >
                  {busy && <Spinner />}
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
              {!configured() && (
                <p className="fine-print">
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
                <div className="qr-block">
                  <img
                    src={qr}
                    width="180"
                    height="180"
                    alt="Authenticator enrollment QR code"
                  />
                  <p>
                    Scan with your authenticator to enroll the owner account.
                  </p>
                </div>
              )}
              <label>
                Authenticator code
                <input
                  className="code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <button className="primary full large" disabled={busy}>
                {busy && <Spinner />}
                {busy ? 'Verifying…' : 'Verify'}
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
                <p className="field-hint">
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
              <button className="primary full large" disabled={busy}>
                {busy ? <Spinner /> : <KeyRound size={17} aria-hidden />}
                {busy
                  ? phase === 'unlock'
                    ? 'Unlocking…'
                    : 'Creating vault…'
                  : phase === 'unlock'
                    ? 'Unlock'
                    : 'Create vault'}
              </button>
              {busy && (
                <p className="fine-print center" role="status">
                  Deriving your key on this device. This can take a moment.
                </p>
              )}
            </form>
          )}
          {phase === 'recovery' && (
            <>
              <code className="recovery-key">{recovery}</code>
              <button
                type="button"
                className="secondary full large"
                onClick={() =>
                  download(
                    new Blob([recovery], { type: 'text/plain' }),
                    'money-tracker-recovery-key.txt',
                  )
                }
              >
                <Download size={17} aria-hidden />
                Download offline recovery key
              </button>
              <p className="fine-print">
                Store this away from the app and your account password.
              </p>
              <button
                type="button"
                className="primary full large"
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
                {busy && <Spinner />}I saved the key · verify recovery &amp;
                continue
              </button>
            </>
          )}
          {phase !== 'login' && (
            <button type="button" className="text-button full" onClick={lock}>
              Back to sign in
            </button>
          )}
        </div>
        <p className="welcome-footer">
          USD · America/New_York · Tracking from September 2026
        </p>
      </section>
    </main>
  );
}
