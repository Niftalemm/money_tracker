'use client';
import { useState } from 'react';
import { CalendarClock, CalendarPlus, Trash2 } from 'lucide-react';
import { uid, type TrackerState } from '@/lib/model';
import { money, monthLabel } from '@/lib/accounting';
import { parseMoney } from '@/lib/imports';
import { billLabel, billsForMonth, shortDate } from '@/lib/insights';
import { changer } from './change';
import { CardHeader, CategoryIcon, EmptyState, Pill } from './ui';
export default function Recurring({
  state,
  month,
  busy,
  save,
  notify,
  onError,
}: {
  state: TrackerState;
  month: string;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  notify: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [billName, setBillName] = useState(''),
    [billAmount, setBillAmount] = useState(''),
    [billCategory, setBillCategory] = useState('Housing'),
    [dueDay, setDueDay] = useState(1);
  const change = changer(state, save, onError, notify);
  const summary = billsForMonth(state, month);
  const open = summary.bills.filter(
      (b) => b.status === 'none' || b.status === 'unpaid',
    ),
    done = summary.bills.filter(
      (b) => b.status === 'linked' || b.status === 'changed',
    );
  const section = (title: string, list: typeof summary.bills) =>
    list.length > 0 && (
      <>
        <h3 className="section-label">
          {title} <span className="count">{list.length}</span>
        </h3>
        <ul className="bill-rows">
          {list.map(({ bill, due, payment, status, upcoming }) => {
            const [label, tone] = billLabel(status, upcoming);
            return (
              <li key={bill.id} className="bill-row">
                <CategoryIcon name={bill.category} />
                <div className="bill-info">
                  <strong>{bill.name}</strong>
                  <span>
                    Due {shortDate(due)} · {bill.category}
                  </span>
                  {status === 'changed' && payment && (
                    <span className="warn-text">
                      Amount changed: linked payment{' '}
                      {money(payment.amountCents)}; expected{' '}
                      {money(bill.amountCents)}.
                    </span>
                  )}
                  {!payment && (
                    <label className="check small">
                      <input
                        type="checkbox"
                        checked={status === 'unpaid'}
                        disabled={busy}
                        onChange={(e) =>
                          void change(
                            (s) => {
                              const b = s.bills.find((r) => r.id === bill.id)!;
                              b.confirmedUnpaidMonths =
                                b.confirmedUnpaidMonths.filter(
                                  (m) => m !== month,
                                );
                              if (e.target.checked)
                                b.confirmedUnpaidMonths.push(month);
                            },
                            e.target.checked
                              ? `${bill.name} marked unpaid`
                              : `${bill.name} unpaid mark cleared`,
                          )
                        }
                      />
                      I confirm this bill is unpaid for {monthLabel(month)}
                    </label>
                  )}
                </div>
                <div className="bill-side">
                  <strong>{money(bill.amountCents)}</strong>
                  <span className="bill-actions">
                    <Pill tone={tone}>{label}</Pill>
                    <button
                      type="button"
                      className="icon-button danger-icon"
                      aria-label={`Remove bill ${bill.name}`}
                      disabled={busy}
                      onClick={() =>
                        void change((s) => {
                          s.bills = s.bills.filter((r) => r.id !== bill.id);
                          s.transactions.forEach((t) => {
                            if (t.billId === bill.id) delete t.billId;
                          });
                        }, `${bill.name} removed`)
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );
  return (
    <div className="page-stack">
      <div className="stat-grid">
        <section className="card stat-card">
          <p className="eyebrow-label">Scheduled for {monthLabel(month)}</p>
          <p className="stat-amount">{money(summary.scheduled)}</p>
          <p className="fine-print">
            {summary.bills.length}{' '}
            {summary.bills.length === 1 ? 'bill' : 'bills'}
          </p>
        </section>
        <section className="card stat-card">
          <p className="eyebrow-label">Payments linked</p>
          <p className="stat-amount credit">
            {summary.linked} of {summary.bills.length}
          </p>
          <p className="fine-print">Linked from a purchase’s edit panel.</p>
        </section>
        <section className="card stat-card">
          <p className="eyebrow-label">Not yet recorded</p>
          <p className="stat-amount">{money(summary.remaining)}</p>
          <p className="fine-print">
            Planning assumes these occur. A missing import is not a missed
            payment.
          </p>
        </section>
      </div>
      <div className="two-col wide-left">
        <section className="card">
          <CardHeader
            title="Bills"
            subtitle={`Status for ${monthLabel(month)}. Due days clamp to shorter months.`}
          />
          {summary.bills.length ? (
            <>
              {section('Not yet recorded', open)}
              {section('Payment linked', done)}
            </>
          ) : (
            <EmptyState icon={CalendarClock} title="No scheduled bills">
              Add rent, utilities, or subscriptions to include them in month-end
              planning.
            </EmptyState>
          )}
        </section>
        <section className="card">
          <CardHeader
            title="Add a scheduled bill"
            subtitle="Optional planning. Link the matching purchase later to avoid double counting."
          />
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
              }, `${billName} added`).then((saved) => {
                if (!saved) return;
                setBillName('');
                setBillAmount('');
              });
            }}
          >
            <label>
              Bill name
              <input
                required
                maxLength={100}
                value={billName}
                onChange={(e) => setBillName(e.target.value)}
                placeholder="e.g. Apartment rent"
              />
            </label>
            <div className="form-grid">
              <label>
                Amount (USD)
                <input
                  required
                  inputMode="decimal"
                  value={billAmount}
                  placeholder="0.00"
                  onChange={(e) => setBillAmount(e.target.value)}
                />
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
            <div className="form-actions">
              <button className="primary" disabled={busy}>
                <CalendarPlus size={16} aria-hidden />
                Add scheduled bill
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
