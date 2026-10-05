'use client';
import { useState } from 'react';
import { Plus, Search, SearchX, X } from 'lucide-react';
import {
  ACCOUNTS,
  TYPES,
  type Account,
  type TrackerState,
  type Transaction,
  type TransactionType,
} from '@/lib/model';
import { monthLabel, monthTransactions, money, total } from '@/lib/accounting';
import TransactionList from './TransactionTable';
import { AccountBadge, EmptyState } from './ui';
export type Filters = {
  search: string;
  account: '' | Account;
  category: string;
  type: '' | TransactionType;
};
export const NO_FILTERS: Filters = {
  search: '',
  account: '',
  category: '',
  type: '',
};
const PAGE = 50;
export default function Transactions({
  state,
  month,
  filters,
  onFilters,
  onEdit,
  onAdd,
}: {
  state: TrackerState;
  month: string;
  filters: Filters;
  onFilters: (f: Filters) => void;
  onEdit: (t: Transaction) => void;
  onAdd: () => void;
}) {
  const [page, setPage] = useState(0);
  const { search, account, category, type } = filters;
  const set = (patch: Partial<Filters>) => {
    onFilters({ ...filters, ...patch });
    setPage(0);
  };
  const list = monthTransactions(state, month)
    .filter(
      (t) =>
        (!account || t.account === account) &&
        (!category || t.category === category) &&
        (!type || t.type === type) &&
        t.merchant.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)),
    safePage = Math.min(page, pages - 1);
  const filtered = Boolean(search || account || category || type);
  return (
    <section className="card">
      <div className="filter-bar">
        <label className="search-field">
          <Search size={17} aria-hidden />
          <input
            type="search"
            aria-label="Search merchants"
            placeholder="Search merchants"
            value={search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">All categories</option>
          {state.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter type"
          value={type}
          onChange={(e) => set({ type: e.target.value as Filters['type'] })}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="chip-row" role="group" aria-label="Filter account">
        <button
          type="button"
          className="chip"
          aria-pressed={!account}
          onClick={() => set({ account: '' })}
        >
          All accounts
        </button>
        {ACCOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            className="chip"
            aria-pressed={account === a}
            onClick={() => set({ account: account === a ? '' : a })}
          >
            <AccountBadge account={a} size="sm" />
            {a}
          </button>
        ))}
      </div>
      <div className="list-summary">
        <p>
          <strong>{list.length}</strong>{' '}
          {list.length === 1 ? 'transaction' : 'transactions'} ·{' '}
          <strong>{money(total(list))}</strong> net spending
        </p>
        {filtered && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onFilters(NO_FILTERS);
              setPage(0);
            }}
          >
            <X size={15} aria-hidden />
            Clear filters
          </button>
        )}
      </div>
      <TransactionList
        grouped
        transactions={list.slice(safePage * PAGE, (safePage + 1) * PAGE)}
        onEdit={onEdit}
        empty={
          <EmptyState
            icon={filtered ? SearchX : Plus}
            title="No transactions here yet."
            action={
              filtered ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onFilters(NO_FILTERS)}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" className="secondary" onClick={onAdd}>
                  <Plus size={16} aria-hidden />
                  Add an expense
                </button>
              )
            }
          >
            {filtered
              ? `Nothing in ${monthLabel(month)} matches these filters.`
              : `Upload a statement or add an expense for ${monthLabel(month)}.`}
          </EmptyState>
        }
      />
      {list.length > PAGE && (
        <div className="pager">
          <button
            type="button"
            className="secondary"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <span>
            Page {safePage + 1} of {pages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={safePage + 1 >= pages}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
