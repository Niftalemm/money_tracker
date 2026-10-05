'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import {
  ACCOUNTS,
  TYPES,
  type TrackerState,
  type Transaction,
} from '@/lib/model';
import { monthTransactions, money, total } from '@/lib/accounting';
import TransactionTable from './TransactionTable';
export default function Transactions({
  state,
  month,
  onEdit,
}: {
  state: TrackerState;
  month: string;
  onEdit: (t: Transaction) => void;
}) {
  const [search, setSearch] = useState(''),
    [account, setAccount] = useState(''),
    [category, setCategory] = useState(''),
    [type, setType] = useState(''),
    [page, setPage] = useState(0);
  const list = monthTransactions(state, month)
    .filter(
      (t) =>
        (!account || t.account === account) &&
        (!category || t.category === category) &&
        (!type || t.type === type) &&
        t.merchant.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate));
  const safePage = Math.min(page, Math.max(0, Math.ceil(list.length / 50) - 1));
  return (
    <section className="panel">
      <div className="filter-row">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search merchants"
            placeholder="Search merchants"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Filter account"
          value={account}
          onChange={(e) => setAccount(e.target.value)}
        >
          <option value="">All accounts</option>
          {ACCOUNTS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {state.categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <p className="small muted">
        {list.length} transactions · {money(total(list))} net spending
      </p>
      <TransactionTable
        transactions={list.slice(safePage * 50, (safePage + 1) * 50)}
        onEdit={onEdit}
      />
      {list.length > 50 && (
        <div className="modal-actions">
          <button
            className="secondary"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <span>Page {safePage + 1}</span>
          <button
            className="secondary"
            disabled={(safePage + 1) * 50 >= list.length}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
