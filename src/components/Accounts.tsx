'use client';
import { useState } from 'react';
import { CalendarCheck, Trash2 } from 'lucide-react';
import {
  EARLIEST,
  ACCOUNTS,
  uid,
  type Account,
  type TrackerState,
} from '@/lib/model';
import {
  accountCoverage,
  monthLabel,
  monthTransactions,
  total,
  updateNotice,
} from '@/lib/accounting';
import { accountActivity } from '@/lib/insights';
import { AccountTile } from './Dashboard';
import { changer } from './change';
import { AccountBadge, CardHeader, EmptyState } from './ui';
export default function Accounts({
  state,
  month,
  busy,
  save,
  notify,
  onError,
  onTransactions,
}: {
  state: TrackerState;
  month: string;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  notify: (message: string) => void;
  onError: (message: string) => void;
  onTransactions: (account: Account) => void;
}) {
  const [coverageAccount, setCoverageAccount] = useState<Account>('Amex'),
    [from, setFrom] = useState(month + '-01'),
    [through, setThrough] = useState(month + '-01'),
    [confirmed, setConfirmed] = useState(false);
  const change = changer(state, save, onError, notify);
  const tx = monthTransactions(state, month);
  return (
    <div className="page-stack">
      <div className="account-grid wide">
        {ACCOUNTS.map((account) => (
          <section className="card" key={account} aria-label={account}>
            <AccountTile
              account={account}
              cents={total(tx.filter((t) => t.account === account))}
              coverage={accountCoverage(state, account, month)}
              notice={updateNotice(state, account)}
              activity={accountActivity(state, account)}
              onTransactions={() => onTransactions(account)}
            >
              <label className="inline-field">
                <span>Statement usually available on day</span>
                <select
                  aria-label={`${account} statement day`}
                  value={state.preferences.statementDays[account] ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    void change((s) => {
                      s.preferences.statementDays[account] = e.target.value
                        ? +e.target.value
                        : null;
                    }, `${account} statement day saved`)
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
            </AccountTile>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="card">
          <CardHeader
            title="Confirm date coverage"
            subtitle="Confirm a range only after checking every posted transaction, including weeks with no purchases. A statement title alone does not prove coverage."
          />
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
              }, `Coverage confirmed for ${coverageAccount}`).then((saved) => {
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
                  min={EARLIEST}
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
            <div className="form-actions">
              <button className="primary" disabled={busy || !confirmed}>
                <CalendarCheck size={16} aria-hidden />
                Save confirmed coverage
              </button>
            </div>
          </form>
        </section>
        <section className="card">
          <CardHeader
            title="Update notices"
            subtitle="Notices appear once a statement should be available and coverage has not advanced."
          />
          <label className="check">
            <input
              type="checkbox"
              checked={state.preferences.weeklyAmex}
              disabled={busy}
              onChange={(e) =>
                void change(
                  (s) => {
                    s.preferences.weeklyAmex = e.target.checked;
                  },
                  e.target.checked
                    ? 'Weekly Amex notice on'
                    : 'Weekly Amex notice off',
                )
              }
            />
            Enable optional seven-day Amex update notice
          </label>
          <p className="fine-print">
            An old upload won’t clear a notice; coverage must advance. Weekly
            Amex imports never advance the other banks’ coverage.
          </p>
          <h3 className="section-label">
            Confirmed ranges ({state.coverage.length})
          </h3>
          {state.coverage.length ? (
            <ul className="range-list">
              {[...state.coverage]
                .sort((a, b) => b.from.localeCompare(a.from))
                .map((c) => (
                  <li key={c.id}>
                    <AccountBadge account={c.account} size="sm" />
                    <span>
                      {c.account}
                      <span className="range-dates">
                        {c.from} – {c.through}
                        {c.batchId ? ' · from an import' : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      aria-label={`Remove ${c.account} range ${c.from} to ${c.through}`}
                      disabled={busy}
                      onClick={() =>
                        void change((s) => {
                          s.coverage = s.coverage.filter((r) => r.id !== c.id);
                        }, 'Coverage range removed')
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
            </ul>
          ) : (
            <EmptyState icon={CalendarCheck} title="No confirmed ranges">
              Confirm coverage here or while importing a statement for{' '}
              {monthLabel(month)}.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
