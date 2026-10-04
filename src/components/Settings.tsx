'use client';
import { useState } from 'react';
import { ShieldCheck, Download, Plus, Undo2 } from 'lucide-react';
import { ACCOUNTS, uid, type Account, type TrackerState } from '@/lib/model';
import { billDue, billPayment, money } from '@/lib/accounting';
import { parseMoney, undoImport } from '@/lib/imports';
import { unlockVault, type Envelope } from '@/lib/crypto';
import Modal from './Modal';
type Props = {
  state: TrackerState;
  month: string;
  demo: boolean;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  backup: () => void;
  restore: (e: Envelope, key: CryptoKey, state: TrackerState) => Promise<void>;
  onError: (s: string) => void;
};
export default function Settings({
  state,
  month,
  demo,
  busy,
  save,
  backup,
  restore,
  onError,
}: Props) {
  const [category, setCategory] = useState(''),
    [ruleMatch, setRuleMatch] = useState(''),
    [editingRule, setEditingRule] = useState<string | null>(null),
    [ruleCategory, setRuleCategory] = useState('Groceries'),
    [coverageAccount, setCoverageAccount] = useState<Account>('Amex'),
    [from, setFrom] = useState(month + '-01'),
    [through, setThrough] = useState(month + '-01'),
    [confirmed, setConfirmed] = useState(false),
    [billName, setBillName] = useState(''),
    [billAmount, setBillAmount] = useState(''),
    [billCategory, setBillCategory] = useState('Housing'),
    [dueDay, setDueDay] = useState(1),
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
  async function change(fn: (s: TrackerState) => void) {
    try {
      const next = structuredClone(state);
      fn(next);
      await save(next);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to save.');
      return false;
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Accounts &amp; update notices</h2>
            <p className="small muted">
              Set availability days after reviewing each bank’s sample.
            </p>
          </div>
        </div>
        {ACCOUNTS.map((account) => (
          <label key={account} className="setting-row">
            <span>
              {account}
              <span className="small muted block">
                Expected statement availability day
              </span>
            </span>
            <select
              aria-label={`${account} statement day`}
              value={state.preferences.statementDays[account] ?? ''}
              disabled={busy}
              onChange={(e) =>
                void change((s) => {
                  s.preferences.statementDays[account] = e.target.value
                    ? +e.target.value
                    : null;
                })
              }
            >
              <option value="">Not set</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={state.preferences.weeklyAmex}
            disabled={busy}
            onChange={(e) =>
              void change((s) => {
                s.preferences.weeklyAmex = e.target.checked;
              })
            }
          />
          Enable optional seven-day Amex update notice
        </label>
        <p className="small muted">
          An old upload won’t clear a notice. Coverage must advance. The monthly
          ChatGPT reminder asks for all three banks; it cannot detect uploads.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Confirm date coverage</h2>
            <p className="small muted">
              Also confirm weeks with no new purchases.
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void change((s) => {
              if (!confirmed || from > through)
                throw new Error('Verify a valid date range.');
              s.coverage.push({
                id: uid(),
                account: coverageAccount,
                from,
                through,
                confirmedAt: new Date().toISOString(),
              });
            }).then((saved) => {
              if (saved) setConfirmed(false);
            });
          }}
        >
          <label>
            Account
            <select
              value={coverageAccount}
              onChange={(e) => setCoverageAccount(e.target.value as Account)}
            >
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              From
              <input
                type="date"
                min="2026-09-01"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Through
              <input
                type="date"
                min={from}
                required
                value={through}
                onChange={(e) => setThrough(e.target.value)}
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I verified all posted activity, including empty days.
          </label>
          <button className="secondary" disabled={busy || !confirmed}>
            Save confirmed coverage
          </button>
        </form>
        <details className="section-label">
          <summary>Manage confirmed ranges ({state.coverage.length})</summary>
          {state.coverage.map((c) => (
            <div className="setting-row" key={c.id}>
              <span className="small">
                {c.account}
                <br />
                {c.from} – {c.through}
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void change((s) => {
                    s.coverage = s.coverage.filter((r) => r.id !== c.id);
                  })
                }
              >
                Remove range
              </button>
            </div>
          ))}
        </details>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Categories &amp; merchant rules</h2>
            <p className="small muted">
              Clear matches get a category. Everything else stays Uncategorized.
            </p>
          </div>
        </div>
        <div className="category-tags">
          {state.categories.map((c) => (
            <span className="tag" key={c}>
              {c}
            </span>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void change((s) => {
              const name = category.trim();
              if (!name || s.categories.includes(name))
                throw new Error('Choose a new category name.');
              s.categories.push(name);
            }).then((saved) => {
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
            <Plus size={15} />
            Add
          </button>
        </form>
        <h3 className="section-label">Merchant rules</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void change((s) => {
              const id = editingRule ?? uid();
              const rule = {
                id,
                match: ruleMatch.trim(),
                category: ruleCategory,
              };
              if (s.rules.some((r) => r.id === id))
                s.rules = s.rules.map((r) => (r.id === id ? rule : r));
              else s.rules.push(rule);
            }).then((saved) => {
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
          <button className="secondary" disabled={busy}>
            {editingRule ? 'Save merchant rule' : 'Add merchant rule'}
          </button>
        </form>
        <p className="small muted">
          Rules apply to new imports. Existing category edits are preserved.
          First matching rule wins.
        </p>
        {state.rules.map((rule) => (
          <div className="rule-row" key={rule.id}>
            <span>{rule.match}</span>
            <select
              aria-label={`Category rule ${rule.match}`}
              value={rule.category}
              disabled={busy}
              onChange={(e) =>
                void change((s) => {
                  s.rules.find((r) => r.id === rule.id)!.category =
                    e.target.value;
                })
              }
            >
              {state.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setRuleMatch(rule.match);
                setRuleCategory(rule.category);
                setEditingRule(rule.id);
              }}
            >
              Edit
            </button>
            <button
              className="danger-text"
              disabled={busy}
              onClick={() =>
                void change((s) => {
                  s.rules = s.rules.filter((r) => r.id !== rule.id);
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Scheduled bills</h2>
            <p className="small muted">
              Optional planning. A missing import is not a missed payment.
            </p>
          </div>
        </div>
        {state.bills.map((b) => {
          const payment = billPayment(state, b.id, month),
            unpaid = b.confirmedUnpaidMonths.includes(month);
          return (
            <div className="bill-card" key={b.id}>
              <div className="setting-row">
                <span>
                  <strong>{b.name}</strong>
                  <span className="small muted block">
                    {money(b.amountCents)} · due {billDue(month, b.dueDay)}
                  </span>
                </span>
                <span className="tag">
                  {payment
                    ? 'Payment linked'
                    : unpaid
                      ? 'Confirmed unpaid'
                      : 'No payment recorded'}
                </span>
              </div>
              {payment && payment.amountCents !== b.amountCents && (
                <p className="small warning">
                  Amount changed: linked payment {money(payment.amountCents)};
                  expected {money(b.amountCents)}.
                </p>
              )}
              {!payment && (
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={unpaid}
                    disabled={busy}
                    onChange={(e) =>
                      void change((s) => {
                        const bill = s.bills.find((r) => r.id === b.id)!;
                        bill.confirmedUnpaidMonths =
                          bill.confirmedUnpaidMonths.filter((m) => m !== month);
                        if (e.target.checked)
                          bill.confirmedUnpaidMonths.push(month);
                      })
                    }
                  />
                  I confirm this bill is unpaid for {month}
                </label>
              )}
              <button
                className="text-button small"
                disabled={busy}
                onClick={() =>
                  void change((s) => {
                    s.bills = s.bills.filter((r) => r.id !== b.id);
                    s.transactions.forEach((t) => {
                      if (t.billId === b.id) delete t.billId;
                    });
                  })
                }
              >
                Remove bill
              </button>
            </div>
          );
        })}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void change((s) => {
              s.bills.push({
                id: uid(),
                name: billName,
                amountCents: parseMoney(billAmount),
                category: billCategory,
                dueDay,
                confirmedUnpaidMonths: [],
              });
            }).then((saved) => {
              if (!saved) return;
              setBillName('');
              setBillAmount('');
            });
          }}
        >
          <div className="form-grid">
            <label>
              Bill name
              <input
                required
                maxLength={100}
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
              />
            </label>
            <label>
              Amount (USD)
              <input
                required
                inputMode="decimal"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
              >
                {state.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Due day
              <input
                type="number"
                min="1"
                max="31"
                required
                value={dueDay}
                onChange={(e) => setDueDay(+e.target.value)}
              />
            </label>
          </div>
          <button className="secondary" disabled={busy}>
            Add scheduled bill
          </button>
        </form>
        <p className="small muted">
          Link a purchase from its edit dialog to avoid double counting. Due
          days clamp to shorter months.
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Import history</h2>
            <p className="small muted">
              Undo removes this batch’s new records and coverage. Shared and
              manual records remain.
            </p>
          </div>
          <Undo2 size={18} />
        </div>
        {state.batches.length ? (
          [...state.batches].reverse().map((b) => (
            <div className="setting-row" key={b.id}>
              <span>
                {b.account}
                <span className="small muted block">
                  {new Date(b.importedAt).toLocaleDateString('en-US', {
                    timeZone: 'America/New_York',
                  })}{' '}
                  · {b.added} added · {b.duplicates} linked
                </span>
              </span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setUndo(b.id)}
              >
                Undo
              </button>
            </div>
          ))
        ) : (
          <p className="muted">No imports yet.</p>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Encryption &amp; backup</h2>
            <p className="small muted">
              A readable Excel export is not an encrypted backup.
            </p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p className="small muted">
          Unlock keys stay in memory. The app locks after 10 minutes without
          activity. Cloud records, settings, and import history are stored
          together as authenticated ciphertext.
        </p>
        <button
          className="secondary"
          disabled={demo || busy}
          onClick={() => {
            try {
              backup();
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Backup failed.');
            }
          }}
        >
          <Download size={16} />
          Encrypted full backup
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => setRestoring(true)}
        >
          Verify / restore backup
        </button>
        {demo && (
          <p className="small muted">
            The synthetic demo has no encryption key. Encrypted backups require
            a configured, unlocked owner vault.
          </p>
        )}
        <p className="small muted">
          Store your recovery key offline. Login recovery cannot decrypt
          financial data. A compromised device or malicious application code can
          access unlocked records.
        </p>
      </section>
      {undo && (
        <Modal title="Undo this import?" onClose={() => setUndo(null)}>
          <p>
            This removes records introduced only by this batch and its confirmed
            coverage. Previously imported and manual entries remain.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setUndo(null)}>
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                try {
                  await save(undoImport(state, undo));
                  setUndo(null);
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
          onClose={() => {
            setRestoring(false);
            setVerified(null);
            setBackupSecret('');
            setBackupFile(null);
          }}
        >
          <p className="muted">
            Decrypt and validate locally before deciding whether to replace your
            vault.
          </p>
          {restoreError && (
            <p className="alert error" role="alert">
              {restoreError}
            </p>
          )}
          <label>
            Encrypted backup file
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                setVerified(null);
                setRestoreError('');
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 20 * 1024 * 1024)
                    throw new Error('Backup exceeds 20 MB.');
                  setBackupFile(JSON.parse(await file.text()));
                } catch {
                  setBackupFile(null);
                  setRestoreError('Choose a valid encrypted backup JSON file.');
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
              onChange={(e) => setBackupSecret(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={useRecovery}
              onChange={(e) => setUseRecovery(e.target.checked)}
            />
            Use the offline recovery key
          </label>
          <button
            className="secondary"
            disabled={!backupFile || checking}
            onClick={async () => {
              setChecking(true);
              const secret = backupSecret;
              setBackupSecret('');
              try {
                setVerified(await unlockVault(backupFile, secret, useRecovery));
                setRestoreError('');
              } catch {
                setVerified(null);
                setRestoreError(
                  'Backup verification failed. Check the file and unlock secret / recovery key.',
                );
              } finally {
                setChecking(false);
              }
            }}
          >
            {checking ? 'Verifying…' : 'Decrypt & verify locally'}
          </button>
          {verified && (
            <div className="alert success">
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
                className="danger"
                disabled={busy}
                onClick={async () => {
                  try {
                    await restore(
                      verified.envelope,
                      verified.key,
                      verified.state,
                    );
                    setVerified(null);
                    setBackupFile(null);
                    setRestoring(false);
                  } catch (e) {
                    setRestoreError(
                      e instanceof Error ? e.message : 'Restore failed.',
                    );
                  }
                }}
              >
                Confirm replace with verified backup
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
