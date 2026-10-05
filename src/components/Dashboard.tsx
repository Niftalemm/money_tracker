'use client';
import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { ArrowUpRight, ChevronRight, CircleHelp } from 'lucide-react';
import { ACCOUNTS, type TrackerState, type Transaction } from '@/lib/model';
import {
  accountCoverage,
  change,
  comparison,
  estimate,
  groups,
  monthLabel,
  monthTransactions,
  money,
  net,
  todayNY,
  total,
  trackedMonths,
  updateNotice,
} from '@/lib/accounting';
import Modal from './Modal';
import TransactionTable from './TransactionTable';
export function Delta({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const d = change(current, previous);
  return (
    <span className={d.dollars > 0 ? 'delta up' : 'delta'}>
      {d.dollars > 0 ? '+' : ''}
      {money(d.dollars)}
      {d.percent !== null && (
        <>
          {' '}
          · {d.percent > 0 ? '+' : ''}
          {d.percent.toFixed(1)}%
        </>
      )}
    </span>
  );
}
export default function Dashboard({
  state,
  month,
  onEdit,
  onTransactions,
}: {
  state: TrackerState;
  month: string;
  onEdit: (t: Transaction) => void;
  onTransactions: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null),
    [merchant, setMerchant] = useState<string | null>(null);
  const tx = monthTransactions(state, month),
    actual = total(tx),
    projection = estimate(state, month),
    comp = comparison(state, month),
    categoryData = groups(tx, 'category');
  for (const prior of groups(comp.previousTransactions, 'category'))
    if (!categoryData.some((g) => g.name === prior.name))
      categoryData.push({ name: prior.name, cents: 0 });
  const covered = ACCOUNTS.map((a) => ({
      account: a,
      ...accountCoverage(state, a, month),
    })),
    complete = covered.every((c) => c.complete);
  const uncategorized = tx.filter(
    (t) => t.category === 'Uncategorized' && t.type === 'purchase',
  );
  const months = trackedMonths().map((m) => {
    const c = comparison(state, m);
    return {
      month: m,
      label: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(m + '-01')),
      actual: total(monthTransactions(state, m)),
      estimate: estimate(state, m)?.cents,
      complete: ACCOUNTS.every((a) => accountCoverage(state, a, m).complete),
      comp: c,
    };
  });
  const selected = tx.filter(
    (t) => t.category === category && (!merchant || t.merchant === merchant),
  );
  const merchantData = groups(
    tx.filter((t) => t.category === category),
    'merchant',
  );
  for (const prior of groups(
    comp.previousTransactions.filter((t) => t.category === category),
    'merchant',
  ))
    if (!merchantData.some((g) => g.name === prior.name))
      merchantData.push({ name: prior.name, cents: 0 });
  return (
    <>
      <div className="summary-grid">
        <section className="summary-card hero-card">
          <p className="card-label">
            Net spending{' '}
            <span className="tag">{complete ? 'Covered' : 'Partial'}</span>
          </p>
          <p className="big-amount" data-testid="net-spending">
            {money(actual)}
          </p>
          <p className="small">
            {comp.available ? (
              <>
                <Delta current={comp.current} previous={comp.previous} />{' '}
                <span className="muted">
                  vs. {monthLabel(comp.prior)} · days 1–{comp.days}
                </span>
              </>
            ) : (
              <span className="muted">
                {month === '2026-09'
                  ? 'Your first tracked month'
                  : 'Add confirmed coverage to compare'}
              </span>
            )}
          </p>
        </section>
        <section className="summary-card">
          <p className="card-label">
            {projection?.label ?? 'Month-end estimate'}
            <CircleHelp size={16} />
          </p>
          <p className="big-amount">
            {projection ? money(projection.cents) : '—'}
          </p>
          <p className="small muted">
            {projection
              ? 'Planning only · separate from actual spending'
              : month < todayNY().slice(0, 7)
                ? 'Past month · actual spending shown'
                : 'Needs aligned coverage or a complete prior month'}
          </p>
        </section>
        <section className="summary-card">
          <p className="card-label">
            Data coverage
            <span className="status-dot" />
          </p>
          <p className="coverage-headline">
            {complete ? 'All accounts covered' : 'A few gaps to fill'}
          </p>
          <div className="mini-coverage">
            {covered.map((c) => (
              <div key={c.account}>
                <span>{c.account}</span>
                <span>
                  {c.covered}/{c.endDay} days
                </span>
              </div>
            ))}
          </div>
          <p className="small muted">
            Last saved:{' '}
            {state.updatedAt
              ? new Intl.DateTimeFormat('en-US', {
                  timeZone: 'America/New_York',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(state.updatedAt))
              : 'No saved records'}
          </p>
        </section>
      </div>
      {projection && (
        <p className="estimate-note">
          <CircleHelp size={15} />
          {projection.detail}
        </p>
      )}
      {comp.available && comp.partial && (
        <p className="small muted comparison-note">
          Comparison uses equal elapsed days through day {comp.days}; missing
          account coverage makes results partial.
        </p>
      )}
      <div className="chart-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Spending by category</h2>
              <p className="small muted">
                Every dollar, a little more context.
              </p>
            </div>
            <span className="tag">
              {tx.filter((t) => t.type === 'purchase').length} purchases
            </span>
          </div>
          {categoryData.length ? (
            <>
              <div className="category-chart" aria-hidden="true">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={categoryData.map((g) => ({
                      name: g.name,
                      dollars: g.cents / 100,
                    }))}
                    layout="vertical"
                    margin={{ left: 0, right: 65 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={100}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64746f' }}
                    />
                    <Tooltip
                      formatter={(value) =>
                        money(Math.round(Number(value) * 100))
                      }
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="dollars"
                      fill="#438a78"
                      radius={[0, 4, 4, 0]}
                      onClick={(data) => {
                        setCategory(String(data.name));
                        setMerchant(null);
                      }}
                    >
                      <LabelList
                        dataKey="dollars"
                        position="right"
                        formatter={(value) =>
                          money(Math.round(Number(value) * 100))
                        }
                        style={{ fill: '#34574e', fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="table-wrap">
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>Category · select for details</th>
                      <th>Net spending</th>
                      <th>
                        Change{comp.available ? ` · days 1–${comp.days}` : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryData.map((g) => (
                      <tr key={g.name}>
                        <td>
                          <button
                            className="table-link"
                            onClick={() => {
                              setCategory(g.name);
                              setMerchant(null);
                            }}
                          >
                            {g.name}
                            <ChevronRight size={13} />
                          </button>
                        </td>
                        <td>{money(g.cents)}</td>
                        <td>
                          {comp.available ? (
                            <Delta
                              current={total(
                                comp.currentTransactions.filter(
                                  (t) => t.category === g.name,
                                ),
                              )}
                              previous={total(
                                comp.previousTransactions.filter(
                                  (t) => t.category === g.name,
                                ),
                              )}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">
              Upload your first transactions to see category details.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>The monthly picture</h2>
              <p className="small muted">
                Actual spending and a clearly labeled estimate.
              </p>
            </div>
            <ArrowUpRight size={20} className="muted" />
          </div>
          <div className="monthly-chart" aria-hidden="true">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={months} margin={{ right: 10, left: 10, top: 20 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e8eeeb"
                />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${Math.round(v / 100)}`}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  formatter={(value, name) => [
                    money(Number(value)),
                    name === 'actual' ? 'Actual' : 'Estimate',
                  ]}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="actual"
                  fill="#226e5b"
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="estimate"
                  fill="#d9e8e1"
                  stroke="#6e998c"
                  strokeDasharray="4 3"
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Actual
            </span>
            <span>
              <i className="estimated" />
              Estimate
            </span>
          </div>
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Actual</th>
                  <th>Change</th>
                  <th>Estimate</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month}>
                    <td>
                      {monthLabel(m.month)}
                      <span className="small muted block">
                        {m.complete ? 'Covered' : 'Partial coverage'}
                      </span>
                    </td>
                    <td>{money(m.actual)}</td>
                    <td>
                      {m.comp.available ? (
                        <>
                          <Delta
                            current={m.comp.current}
                            previous={m.comp.previous}
                          />
                          <span className="small muted block">
                            Days 1–{m.comp.days}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {m.estimate === undefined ? '—' : money(m.estimate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="panel coverage-panel">
        <div className="panel-heading">
          <div>
            <h2>Your three accounts</h2>
            <p className="small muted">
              Coverage is confirmed separately from the dates on your
              transactions.
            </p>
          </div>
        </div>
        <div className="account-grid">
          {covered.map((c, i) => (
            <div className="account-card" key={c.account}>
              <div className="account-title">
                <span className={`account-icon bank-${i}`}>
                  {i === 0 ? 'A' : i === 1 ? 'B' : 'C'}
                </span>
                <h3>{c.account}</h3>
                <span className="tag">
                  {c.complete ? 'Covered' : 'Partial'}
                </span>
              </div>
              <p>
                {money(total(tx.filter((t) => t.account === c.account)))}{' '}
                <span className="small muted">net spending</span>
              </p>
              <p className="small muted">
                {c.ranges.length
                  ? c.ranges.map((r) => `${r.from} – ${r.through}`).join('; ')
                  : 'No confirmed date ranges'}
              </p>
              {c.gaps.length > 0 && (
                <details>
                  <summary className="small">
                    {c.gaps.length} uncovered days
                  </summary>
                  <p className="small muted">{c.gaps.join(', ')}</p>
                </details>
              )}
              {updateNotice(state, c.account) && (
                <p className="small warning">
                  {updateNotice(state, c.account)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent transactions</h2>
              <p className="small muted">
                The latest entries for {monthLabel(month)}.
              </p>
            </div>
            <button className="text-button" onClick={onTransactions}>
              View all
              <ChevronRight size={15} />
            </button>
          </div>
          <TransactionTable
            transactions={[...tx]
              .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
              .slice(0, 5)}
            onEdit={onEdit}
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>A little housekeeping</h2>
              <p className="small muted">
                Small updates keep the picture clear.
              </p>
            </div>
          </div>
          <div className="housekeeping">
            <span className="housekeeping-number">{uncategorized.length}</span>
            <div>
              <h3>Uncategorized purchases</h3>
              <p className="small muted">
                {money(total(uncategorized))} still counts in your spending.
              </p>
            </div>
          </div>
          {uncategorized.slice(0, 3).map((t) => (
            <button
              key={t.id}
              className="uncategorized-row"
              onClick={() => onEdit(t)}
            >
              <span>{t.merchant}</span>
              <span>
                {money(net(t))}
                <ChevronRight size={13} />
              </span>
            </button>
          ))}
          {uncategorized.length === 0 && (
            <p className="small muted">Everything has a category.</p>
          )}
          <p className="small muted housekeeping-foot">
            Review your exports and confirm coverage in Settings.
          </p>
        </section>
      </div>
      {category && (
        <Modal
          title={`${category} · ${money(total(tx.filter((t) => t.category === category)))}`}
          wide
          onClose={() => {
            setCategory(null);
            setMerchant(null);
          }}
        >
          <p className="muted">
            Choose a merchant to see exact purchases and credits. Changes use
            the same comparable days as the dashboard.
          </p>
          <div className="table-wrap">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Spending</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {merchantData.map((g) => (
                  <tr key={g.name}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() =>
                          setMerchant(merchant === g.name ? null : g.name)
                        }
                      >
                        {g.name}
                      </button>
                    </td>
                    <td>{money(g.cents)}</td>
                    <td>
                      {comp.available ? (
                        <Delta
                          current={total(
                            comp.currentTransactions.filter(
                              (t) =>
                                t.category === category &&
                                t.merchant === g.name,
                            ),
                          )}
                          previous={total(
                            comp.previousTransactions.filter(
                              (t) =>
                                t.category === category &&
                                t.merchant === g.name,
                            ),
                          )}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="section-label">
            {merchant ?? 'All merchants'} · exact transactions
          </h3>
          <TransactionTable
            transactions={selected}
            onEdit={(t) => {
              setCategory(null);
              onEdit(t);
            }}
          />
        </Modal>
      )}
    </>
  );
}
