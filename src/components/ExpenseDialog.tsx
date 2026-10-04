'use client';
import { useState } from 'react';
import {
  ACCOUNTS,
  TYPES,
  uid,
  transactionSchema,
  type TrackerState,
  type Transaction,
} from '@/lib/model';
import { money, todayNY } from '@/lib/accounting';
import { parseMoney } from '@/lib/imports';
import Modal from './Modal';
export default function ExpenseDialog({
  state,
  transaction,
  month,
  busy,
  save,
  onClose,
}: {
  state: TrackerState;
  transaction?: Transaction;
  month: string;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  onClose: () => void;
}) {
  const [t, setT] = useState<Transaction>(
    transaction ?? {
      id: uid(),
      postedDate: month === todayNY().slice(0, 7) ? todayNY() : month + '-01',
      merchant: '',
      amountCents: 0,
      account: 'Amex',
      category: 'Uncategorized',
      type: 'purchase',
      notes: '',
      source: 'manual',
      batchIds: [],
      reimbursementCents: 0,
      oneTime: false,
    },
  );
  const [amount, setAmount] = useState(
      transaction ? (transaction.amountCents / 100).toFixed(2) : '',
    ),
    [reimbursement, setReimbursement] = useState(
      (t.reimbursementCents / 100).toFixed(2),
    ),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState(false);
  const update = (key: keyof Transaction, value: unknown) =>
    setT({ ...t, [key]: value });
  async function submit() {
    try {
      const current = transactionSchema.parse({
        ...t,
        amountCents: parseMoney(amount),
        reimbursementCents:
          t.type === 'purchase' ? parseMoney(reimbursement) : 0,
        billId: t.type === 'purchase' ? t.billId : undefined,
        reimbursementFor: ['income', 'refund'].includes(t.type)
          ? t.reimbursementFor
          : undefined,
      });
      const next = structuredClone(state);
      next.transactions = next.transactions
        .filter((r) => r.id !== current.id)
        .concat(current);
      await save(next);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Check the transaction fields.',
      );
    }
  }
  async function remove() {
    try {
      const next = structuredClone(state);
      next.transactions = next.transactions
        .filter((r) => r.id !== t.id)
        .map((r) =>
          r.reimbursementFor === t.id
            ? { ...r, reimbursementFor: undefined }
            : r,
        );
      await save(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }
  return (
    <Modal
      title={transaction ? 'Edit transaction' : 'Add an expense'}
      onClose={onClose}
    >
      <p className="muted">
        Use your keyboard’s dictation if helpful, then review every field before
        saving.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          Merchant or description
          <input
            required
            maxLength={1000}
            value={t.merchant}
            onChange={(e) => update('merchant', e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Posted date
            <input
              type="date"
              min="2026-09-01"
              required
              value={t.postedDate}
              onChange={(e) => update('postedDate', e.target.value)}
            />
          </label>
          <label>
            Amount (USD, positive)
            <input
              inputMode="decimal"
              placeholder="0.00"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label>
            Account / payment method
            <select
              value={t.account}
              onChange={(e) => update('account', e.target.value)}
            >
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              value={t.category}
              onChange={(e) => update('category', e.target.value)}
            >
              {state.categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={t.type}
              onChange={(e) => update('type', e.target.value)}
            >
              {TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          {t.type === 'purchase' && (
            <label>
              Confirmed shared reimbursement (USD)
              <input
                inputMode="decimal"
                value={reimbursement}
                onChange={(e) => setReimbursement(e.target.value)}
              />
            </label>
          )}
        </div>
        <p className="small muted">
          Purchases and fees add spending. Refunds reduce it in the posted
          month. Transfers and income are visible and excluded.
        </p>
        {t.type === 'purchase' && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={t.oneTime}
                onChange={(e) => update('oneTime', e.target.checked)}
              />
              One-time cost · exclude from projection rate
            </label>
            <label>
              Link scheduled bill
              <select
                value={t.billId ?? ''}
                onChange={(e) => update('billId', e.target.value || undefined)}
              >
                <option value="">No bill link</option>
                {state.bills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · expected {money(b.amountCents)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {['income', 'refund'].includes(t.type) && (
          <label>
            Match an already recorded shared reimbursement
            <select
              value={t.reimbursementFor ?? ''}
              onChange={(e) =>
                update('reimbursementFor', e.target.value || undefined)
              }
            >
              <option value="">No reimbursement match</option>
              {state.transactions
                .filter(
                  (r) => r.type === 'purchase' && r.reimbursementCents > 0,
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.postedDate} · {r.merchant} ·{' '}
                    {money(r.reimbursementCents)}
                  </option>
                ))}
            </select>
            <span className="small muted">
              Match the exact confirmed amount to prevent subtracting it twice.
            </span>
          </label>
        )}
        <label>
          Notes (optional)
          <textarea
            maxLength={1000}
            value={t.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </label>
        <div className="modal-actions">
          {transaction && (
            <button
              type="button"
              className="danger-text"
              onClick={() => setDeleting(true)}
            >
              Delete
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save transaction'}
          </button>
        </div>
      </form>
      {deleting && (
        <div className="alert error">
          <p>Delete this transaction? This changes your spending totals.</p>
          <button className="secondary" onClick={() => setDeleting(false)}>
            Keep transaction
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void remove()}
          >
            Confirm delete
          </button>
        </div>
      )}
    </Modal>
  );
}
