'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Cpu,
  Download,
  FileCheck2,
  History,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Timer,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { TrackerState } from '@/lib/model';
import { uid } from '@/lib/model';
import { undoImport } from '@/lib/imports';
import { unlockVault, type Envelope } from '@/lib/crypto';
import Modal from './Modal';
import { changer } from './change';
import {
  AccountBadge,
  CardHeader,
  CategoryIcon,
  EmptyState,
  Notice,
  Spinner,
} from './ui';
type Props = {
  state: TrackerState;
  demo: boolean;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  backup: () => void;
  restore: (e: Envelope, key: CryptoKey) => Promise<void>;
  notify: (message: string) => void;
  onError: (s: string) => void;
};
export default function Settings({
  state,
  demo,
  busy,
  save,
  backup,
  restore,
  notify,
  onError,
}: Props) {
  const [category, setCategory] = useState(''),
    [ruleMatch, setRuleMatch] = useState(''),
    [editingRule, setEditingRule] = useState<string | null>(null),
    [ruleCategory, setRuleCategory] = useState('Groceries'),
    [undo, setUndo] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false),
    [backupFile, setBackupFile] = useState<unknown>(null),
    [backupSecret, setBackupSecret] = useState(''),
    [useRecovery, setUseRecovery] = useState(false),
    [verified, setVerified] = useState<Awaited<
      ReturnType<typeof unlockVault>
    > | null>(null),
    [restoreError, setRestoreError] = useState(''),
    [checking, setChecking] = useState(false);
  const backupGeneration = useRef(0);
  useEffect(
    () => () => {
      backupGeneration.current++;
    },
    [],
  );
  function invalidateBackup() {
    backupGeneration.current++;
    setVerified(null);
    setChecking(false);
  }
  const change = changer(state, save, onError, notify);
  const usage = (name: string) =>
    state.transactions.filter((t) => t.category === name).length;
  return (
    <div className="settings-grid">
      <section className="card">
        <CardHeader
          title="Appearance"
          subtitle="System follows your phone or computer. Your choice is saved in the encrypted vault, not in the browser."
        />
        <fieldset className="segmented-field">
          <legend className="sr-only">Theme</legend>
          <div className="segmented three">
            {(['system', 'light', 'dark'] as const).map((value) => {
              const current = (state.preferences.theme ?? 'system') === value;
              return (
                <label key={value} className={current ? 'on' : ''}>
                  <input
                    type="radio"
                    name="theme"
                    value={value}
                    checked={current}
                    disabled={busy}
                    onChange={() =>
                      void change((s) => {
                        s.preferences.theme = value;
                      })
                    }
                  />
                  {value[0].toUpperCase() + value.slice(1)}
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>
      <section className="card">
        <CardHeader
          title="Categories"
          subtitle="Clear matches get a category. Everything else stays Uncategorized and still counts."
        />
        <ul className="category-chips">
          {state.categories.map((c) => (
            <li key={c} className="category-chip">
              <CategoryIcon name={c} size="sm" />
              {c}
              <span className="count">{usage(c)}</span>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const name = category.trim();
            void change((s) => {
              if (!name || s.categories.includes(name))
                throw new Error('Choose a new category name.');
              s.categories.push(name);
            }, `Category “${name}” added`).then((saved) => {
              if (saved) setCategory('');
            });
          }}
        >
          <input
            aria-label="New category"
            placeholder="New category"
            required
            maxLength={80}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <button className="secondary" disabled={busy}>
            <Plus size={15} aria-hidden />
            Add
          </button>
        </form>
      </section>
      <section className="card">
        <CardHeader
          title="Merchant rules"
          subtitle="Rules apply to new imports. Existing category edits are preserved. First matching rule wins."
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void change(
              (s) => {
                const id = editingRule ?? uid();
                const rule = {
                  id,
                  match: ruleMatch.trim(),
                  category: ruleCategory,
                };
                if (s.rules.some((r) => r.id === id))
                  s.rules = s.rules.map((r) => (r.id === id ? rule : r));
                else s.rules.push(rule);
              },
              editingRule ? 'Merchant rule updated' : 'Merchant rule added',
            ).then((saved) => {
              if (!saved) return;
              setRuleMatch('');
              setEditingRule(null);
            });
          }}
        >
          <div className="form-grid">
            <label>
              Description contains
              <input
                required
                maxLength={200}
                value={ruleMatch}
                onChange={(e) => setRuleMatch(e.target.value)}
                placeholder="e.g. Fresh Market"
              />
            </label>
            <label>
              Assign category
              <select
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
              >
                {state.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            {editingRule && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEditingRule(null);
                  setRuleMatch('');
                }}
              >
                Cancel edit
              </button>
            )}
            <button className="secondary" disabled={busy}>
              {editingRule ? 'Save merchant rule' : 'Add merchant rule'}
            </button>
          </div>
        </form>
        {state.rules.length > 0 && (
          <ul className="rule-list">
            {state.rules.map((rule) => (
              <li className="rule-row" key={rule.id}>
                <span className="rule-match">“{rule.match}”</span>
                <select
                  aria-label={`Category rule ${rule.match}`}
                  value={rule.category}
                  disabled={busy}
                  onChange={(e) =>
                    void change((s) => {
                      s.rules.find((r) => r.id === rule.id)!.category =
                        e.target.value;
                    }, 'Merchant rule updated')
                  }
                >
                  {state.categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit rule ${rule.match}`}
                  disabled={busy}
                  onClick={() => {
                    setRuleMatch(rule.match);
                    setRuleCategory(rule.category);
                    setEditingRule(rule.id);
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  className="icon-button danger-icon"
                  aria-label={`Remove rule ${rule.match}`}
                  disabled={busy}
                  onClick={() =>
                    void change((s) => {
                      s.rules = s.rules.filter((r) => r.id !== rule.id);
                    }, 'Merchant rule removed')
                  }
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <CardHeader
          title="Import history"
          subtitle="Undo removes a batch’s new records and its coverage. Shared and manual records remain."
          action={<History size={18} className="muted" aria-hidden />}
        />
        {state.batches.length ? (
          <ul className="history-list">
            {[...state.batches].reverse().map((b) => (
              <li key={b.id}>
                <AccountBadge account={b.account} size="sm" />
                <span className="history-info">
                  {b.account}
                  {b.pdfReview && (
                    <span className="history-tag">
                      <FileCheck2 size={13} aria-hidden />
                      PDF reconciled
                    </span>
                  )}
                  <span className="history-meta">
                    {new Date(b.importedAt).toLocaleDateString('en-US', {
                      timeZone: 'America/New_York',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    · {b.added} added · {b.duplicates} linked
                  </span>
                </span>
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={busy}
                  onClick={() => setUndo(b.id)}
                >
                  <Undo2 size={15} aria-hidden />
                  Undo
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={History} title="No imports yet.">
            Confirmed statement and CSV imports appear here.
          </EmptyState>
        )}
      </section>
      <section className="card">
        <CardHeader
          title="Encryption & backup"
          subtitle="A readable Excel export is not an encrypted backup."
          action={<ShieldCheck size={20} className="brand-icon" aria-hidden />}
        />
        <ul className="security-list">
          <li>
            <KeyRound size={17} aria-hidden />
            <span>
              <strong>Keys stay in memory</strong>
              Never written to browser storage. Lock or sign out discards them.
            </span>
          </li>
          <li>
            <Timer size={17} aria-hidden />
            <span>
              <strong>Locks after 10 minutes idle</strong>
              Including background tabs, on the first interaction after.
            </span>
          </li>
          <li>
            <Cpu size={17} aria-hidden />
            <span>
              <strong>Statements parsed on this device</strong>
              PDFs never leave the browser; only ciphertext reaches the cloud.
            </span>
          </li>
        </ul>
        <div className="button-row">
          <button
            type="button"
            className="primary"
            disabled={demo || busy}
            onClick={() => {
              try {
                backup();
                notify('Encrypted backup downloaded');
              } catch (e) {
                onError(e instanceof Error ? e.message : 'Backup failed.');
              }
            }}
          >
            <Download size={16} aria-hidden />
            Encrypted full backup
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setRestoring(true)}
          >
            Verify / restore backup
          </button>
        </div>
        {demo && (
          <p className="fine-print">
            The synthetic demo has no encryption key. Encrypted backups require
            a configured, unlocked owner vault.
          </p>
        )}
        <p className="fine-print">
          Store your recovery key offline. Login recovery cannot decrypt
          financial data. A compromised device or malicious application code can
          access unlocked records.
        </p>
      </section>
      {undo && (
        <Modal title="Undo this import?" onClose={() => setUndo(null)}>
          <p className="modal-text">
            This removes records introduced only by this batch and its confirmed
            coverage. Previously imported and manual entries remain.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setUndo(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await save(undoImport(state, undo));
                  setUndo(null);
                  notify('Import undone');
                } catch (e) {
                  onError(e instanceof Error ? e.message : 'Undo failed.');
                }
              }}
            >
              Confirm undo
            </button>
          </div>
        </Modal>
      )}
      {restoring && (
        <Modal
          title="Verify encrypted backup"
          description="Decrypt and validate locally before deciding whether to replace your vault."
          onClose={() => {
            invalidateBackup();
            setRestoring(false);
            setVerified(null);
            setBackupSecret('');
            setBackupFile(null);
          }}
        >
          {restoreError && (
            <Notice tone="error" role="alert">
              {restoreError}
            </Notice>
          )}
          <label>
            Encrypted backup file
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                invalidateBackup();
                setBackupFile(null);
                const token = backupGeneration.current;
                setRestoreError('');
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 20 * 1024 * 1024)
                    throw new Error('Backup exceeds 20 MB.');
                  const parsed = JSON.parse(await file.text());
                  if (token === backupGeneration.current) setBackupFile(parsed);
                } catch {
                  if (token === backupGeneration.current) {
                    setBackupFile(null);
                    setRestoreError(
                      'Choose a valid encrypted backup JSON file.',
                    );
                  }
                }
              }}
            />
          </label>
          <label>
            Backup unlock secret / recovery key
            <input
              type="password"
              autoComplete="off"
              required
              value={backupSecret}
              onChange={(e) => {
                invalidateBackup();
                setBackupSecret(e.target.value);
              }}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={useRecovery}
              onChange={(e) => {
                invalidateBackup();
                setUseRecovery(e.target.checked);
              }}
            />
            Use the offline recovery key
          </label>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={!backupFile || checking}
              onClick={async () => {
                const token = ++backupGeneration.current;
                setVerified(null);
                setChecking(true);
                const secret = backupSecret;
                setBackupSecret('');
                try {
                  const result = await unlockVault(
                    backupFile,
                    secret,
                    useRecovery,
                  );
                  if (token === backupGeneration.current) {
                    setVerified(result);
                    setRestoreError('');
                  }
                } catch {
                  if (token === backupGeneration.current) {
                    setVerified(null);
                    setRestoreError(
                      'Backup verification failed. Check the file and unlock secret / recovery key.',
                    );
                  }
                } finally {
                  if (token === backupGeneration.current) setChecking(false);
                }
              }}
            >
              {checking && <Spinner />}
              {checking ? 'Verifying…' : 'Decrypt & verify locally'}
            </button>
          </div>
          {verified && (
            <Notice tone="success">
              <p>
                Verified: {verified.state.transactions.length} transactions,{' '}
                {verified.state.batches.length} imports,{' '}
                {verified.state.coverage.length} coverage ranges, and{' '}
                {verified.state.bills.length} bills.
              </p>
              <p>
                The backup’s unlock secret and recovery key will apply after
                restore. This replaces all current records and settings.
              </p>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                  try {
                    await restore(verified.envelope, verified.key);
                    setVerified(null);
                    setBackupFile(null);
                    setRestoring(false);
                    notify('Backup restored');
                  } catch (e) {
                    setRestoreError(
                      e instanceof Error ? e.message : 'Restore failed.',
                    );
                  }
                }}
              >
                Confirm replace with verified backup
              </button>
            </Notice>
          )}
        </Modal>
      )}
    </div>
  );
}
