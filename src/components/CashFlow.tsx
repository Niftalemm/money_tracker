'use client';
import { useState } from 'react';
import { ChartColumn, Store } from 'lucide-react';
import {
  comparison,
  groups,
  money,
  monthLabel,
  monthTransactions,
  total,
  trackedMonths,
} from '@/lib/accounting';
import { cashFlow, categoryShares, monthShort } from '@/lib/insights';
import type { TrackerState, Transaction } from '@/lib/model';
import { CashFlowChart } from './Charts';
import CategoryDetail from './CategoryDetail';
import { CategoryIcon, Delta, EmptyState, Progress, categoryTone } from './ui';
export default function CashFlow({
  state,
  month,
  onEdit,
}: {
  state: TrackerState;
  month: string;
  onEdit: (t: Transaction) => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const flow = cashFlow(state, month),
    tx = monthTransactions(state, month),
    comp = comparison(state, month),
    categories = categoryShares(tx),
    largest = Math.max(1, ...categories.map((c) => c.cents));
  const merchants = groups(tx, 'merchant').slice(0, 8),
    topMerchant = Math.max(1, ...merchants.map((m) => m.cents));
  const months = trackedMonths()
    .slice(-12)
    .map((m) => {
      const f = cashFlow(state, m);
      return {
        month: m,
        label: monthShort(m),
        income: f.income,
        spending: f.spending,
        net: f.net,
      };
    });
  const entries = (name: string) => {
    const count = tx.filter((t) => t.merchant === name).length;
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
  };
  const scoped = (list: Transaction[], name: string) =>
    total(list.filter((t) => t.category === name));
  return (
    <div className="page-stack">
      <div className="stat-grid">
        <section className="card stat-card">
          <p className="eyebrow-label">Recorded income</p>
          <p className="stat-amount credit">{money(flow.income)}</p>
          <p className="fine-print">
            Income entries and imported deposits. Matched reimbursements are
            excluded.
          </p>
        </section>
        <section className="card stat-card">
          <p className="eyebrow-label">Net spending</p>
          <p className="stat-amount">{money(flow.spending)}</p>
          <p className="fine-print">
            Purchases minus refunds and confirmed shared reimbursements.
          </p>
        </section>
        <section className="card stat-card">
          <p className="eyebrow-label">Net cash flow</p>
          <p
            className={
              flow.net >= 0 ? 'stat-amount credit' : 'stat-amount warn'
            }
          >
            {flow.net > 0 ? '+' : ''}
            {money(flow.net)}
          </p>
          <p className="fine-print">
            {flow.income > 0
              ? `Savings rate ${Math.round((flow.net / flow.income) * 100)}% · ${flow.transfers} ${flow.transfers === 1 ? 'transfer' : 'transfers'} excluded`
              : 'Add income entries to see your savings rate.'}
          </p>
        </section>
      </div>
      <section className="card" aria-labelledby="flow-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="flow-title">
              Income and spending by month
            </h2>
            <p className="card-subtitle">
              Income only reflects what you have imported or entered.
            </p>
          </div>
        </div>
        <CashFlowChart data={months} />
        <div className="legend">
          <span>
            <i className="swatch income" aria-hidden />
            Recorded income
          </span>
          <span>
            <i className="swatch current" aria-hidden />
            Net spending
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table numeric">
            <caption className="sr-only">Income and spending by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Income</th>
                <th scope="col">Spending</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr
                  key={m.month}
                  className={m.month === month ? 'selected' : ''}
                >
                  <th scope="row">{monthLabel(m.month)}</th>
                  <td>{money(m.income)}</td>
                  <td>{money(m.spending)}</td>
                  <td className={m.net >= 0 ? 'credit' : 'warn'}>
                    {money(m.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="two-col">
        <section className="card" aria-labelledby="flow-categories">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="flow-categories">
                Categories
              </h2>
              <p className="card-subtitle">
                {comp.available
                  ? `Change vs. ${monthLabel(comp.prior)}, days 1–${comp.days}`
                  : `${monthLabel(month)} spending`}
              </p>
            </div>
          </div>
          {categories.length ? (
            <ul className={comp.available ? 'rank-list' : 'rank-list no-delta'}>
              {categories.map((g) => (
                <li key={g.name}>
                  <button
                    type="button"
                    className="rank-row"
                    aria-label={`${g.name} details`}
                    onClick={() => setCategory(g.name)}
                  >
                    <CategoryIcon name={g.name} />
                    <span className="rank-name">
                      {g.name}
                      <span className="rank-share">
                        {Math.round(g.share * 100)}%
                      </span>
                    </span>
                    <span className="rank-bar">
                      <Progress
                        value={g.cents / largest}
                        tone={categoryTone(g.name)}
                      />
                    </span>
                    <span className="rank-value">{money(g.cents)}</span>
                    <span className="rank-delta">
                      {comp.available && (
                        <Delta
                          compact
                          current={scoped(comp.currentTransactions, g.name)}
                          previous={scoped(comp.previousTransactions, g.name)}
                        />
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ChartColumn} title="No spending this month">
              Categories appear once purchases are recorded.
            </EmptyState>
          )}
        </section>
        <section className="card" aria-labelledby="flow-merchants">
          <div className="card-header">
            <div>
              <h2 className="card-title" id="flow-merchants">
                Top merchants
              </h2>
              <p className="card-subtitle">
                Where most of {monthLabel(month)} went.
              </p>
            </div>
          </div>
          {merchants.length ? (
            <ol className="rank-list numbered">
              {merchants.map((m, i) => (
                <li key={m.name} className="rank-row static">
                  <span className="rank-index">{i + 1}</span>
                  <span className="rank-name">
                    {m.name}
                    <span className="rank-share">{entries(m.name)}</span>
                  </span>
                  <span className="rank-bar">
                    <Progress value={m.cents / topMerchant} tone="c-green" />
                  </span>
                  <span className="rank-value">{money(m.cents)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState icon={Store} title="No merchants yet" />
          )}
        </section>
      </div>
      {category && (
        <CategoryDetail
          state={state}
          month={month}
          category={category}
          onClose={() => setCategory(null)}
          onEdit={onEdit}
        />
      )}
    </div>
  );
}
