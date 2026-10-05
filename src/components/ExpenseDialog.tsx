'use client';
import { useState } from 'react';
import { ZodError } from 'zod';
import { Trash2 } from 'lucide-react';
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
import { AccountBadge, Notice, Spinner } from './ui';
const TYPE_HINT = {
  purchase: 'Adds to spending',
  refund: 'Reduces spending',
  transfer: 'Excluded · e.g. card payment',
  income: 'Excluded from spending',
} as const;
export function readableError(e: unknown, fallback: string) {
  if (e instanceof ZodError) return e.issues[0]?.message ?? fallback;
  return e instanceof Error ? e.message : fallback;
}
export default function ExpenseDialog({
  state,
  transaction,
  month,
  busy,
  save,
  onSaved,
  onClose,
}: {
  state: TrackerState;
  transaction?: Transaction;
  month: string;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  onSaved?: (message: string) => void;
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
        merchant: t.merchant.trim(),
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
      onSaved?.(transaction ? 'Transaction saved' : 'Expense added');
      onClose();
    } catch (e) {
      setError(readableError(e, 'Check the transaction fields.'));
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
      onSaved?.('Transaction deleted');
      onClose();
    } catch (e) {
      setError(readableError(e, 'Delete failed.'));
    }
  }
  return (
    <Modal
      title={transaction ? 'Edit transaction' : 'Add an expense'}
      drawer
      onClose={onClose}
      description={
        transaction
          ? `${transaction.source === 'import' ? 'Imported' : 'Manual entry'} · review every field before saving.`
          : 'Use your keyboard’s dictation if helpful, then review every field before saving.'
      }
    >
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <form
        className="sheet-form"
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
            autoComplete="off"
            onChange={(e) => update('merchant', e.target.value)}
          />
        </label>
        <div className="form-grid">
          <label>
            Amount (USD, positive)
            <span className="input-prefix">
              <span aria-hidden>$</span>
              <input
                aria-label="Amount (USD, positive)"
                inputMode="decimal"
                placeholder="0.00"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </span>
          </label>
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
        </div>
        <fieldset className="segmented-field">
          <legend>Type</legend>
          <div className="segmented">
            {TYPES.map((type) => (
              <label key={type} className={t.type === type ? 'on' : ''}>
                <input
                  type="radio"
                  name="type"
                  value={type}
                  checked={t.type === type}
                  onChange={() => update('type', type)}
                />
                {type[0].toUpperCase() + type.slice(1)}
              </label>
            ))}
          </div>
          <span className="field-hint">{TYPE_HINT[t.type]}</span>
        </fieldset>
        <fieldset className="segmented-field">
          <legend>Account / payment method</legend>
          <div className="account-choices">
            {ACCOUNTS.map((a) => (
              <label key={a} className={t.account === a ? 'on' : ''}>
                <input
                  type="radio"
                  name="account"
                  value={a}
                  checked={t.account === a}
                  onChange={() => update('account', a)}
                />
                <AccountBadge account={a} size="sm" />
                {a}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-grid">
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
        {t.type === 'purchase' && (
          <>
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
            <label className="check">
              <input
                type="checkbox"
                checked={t.oneTime}
                onChange={(e) => update('oneTime', e.target.checked)}
              />
              One-time cost · exclude from projection rate
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
            <span className="field-hint">
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
        <p className="fine-print">
          Purchases and fees add spending. Refunds reduce it in the posted
          month. Transfers and income are visible and excluded.
        </p>
        {transaction && !deleting && (
          <button
            type="button"
            className="danger-text delete-link"
            onClick={() => setDeleting(true)}
          >
            <Trash2 size={16} aria-hidden />
            Delete
          </button>
        )}
        {deleting && (
          <Notice tone="error">
            <p>Delete this transaction? This changes your spending totals.</p>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleting(false)}
              >
                Keep transaction
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Confirm delete
              </button>
            </div>
          </Notice>
        )}
        <div className="modal-actions sticky-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy && <Spinner />}
            {busy ? 'Saving…' : 'Save transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
