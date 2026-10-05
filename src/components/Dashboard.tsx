'use client';
import { useState } from 'react';
import {
  ArrowLeftRight,
  CalendarCheck,
  CalendarClock,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleHelp,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  ACCOUNTS,
  type Account,
  type TrackerState,
  type Transaction,
} from '@/lib/model';
import {
  accountCoverage,
  comparison,
  estimate,
  monthLabel,
  monthTransactions,
  money,
  net,
  todayNY,
  total,
  trackedMonths,
  updateNotice,
  firstMonth,
} from '@/lib/accounting';
import {
  accountActivity,
  billLabel,
  billsForMonth,
  categoryShares,
  cumulativeSeries,
  monthShort,
  setupProgress,
  shortDate,
} from '@/lib/insights';
import CategoryDetail from './CategoryDetail';
import TransactionList from './TransactionTable';
import { MonthlyChart, SpendingChart } from './Charts';
import type { View } from './Tracker';
import type { Filters } from './Transactions';
import {
  AccountBadge,
  CardHeader,
  CategoryIcon,
  Delta,
  EmptyState,
  Pill,
  Progress,
  categoryTone,
} from './ui';
const TOP = 6;
export default function Dashboard({
  state,
  month,
  onEdit,
  onNavigate,
  onFilter,
  onImport,
  onAdd,
}: {
  state: TrackerState;
  month: string;
  onEdit: (t: Transaction) => void;
  onNavigate: (view: View) => void;
  onFilter: (filters: Partial<Filters>) => void;
  onImport: () => void;
  onAdd: () => void;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const tx = monthTransactions(state, month),
    actual = total(tx),
    projection = estimate(state, month),
    comp = comparison(state, month),
    series = cumulativeSeries(state, month);
  const categories = categoryShares(tx);
  for (const prior of categoryShares(comp.previousTransactions))
    if (!categories.some((g) => g.name === prior.name))
      categories.push({ name: prior.name, cents: 0, share: 0 });
  const largest = Math.max(1, ...categories.map((c) => c.cents));
  const covered = ACCOUNTS.map((a) => ({
      account: a,
      ...accountCoverage(state, a, month),
    })),
    complete = covered.every((c) => c.complete);
  const uncategorized = tx.filter(
    (t) => t.category === 'Uncategorized' && t.type === 'purchase',
  );
  const months = trackedMonths(undefined, firstMonth(state))
    .slice(-6)
    .map((m) => ({
      month: m,
      label: monthShort(m),
      actual: total(monthTransactions(state, m)),
      estimate: estimate(state, m)?.cents,
      complete: ACCOUNTS.every((a) => accountCoverage(state, a, m).complete),
      comp: comparison(state, m),
    }));
  const bills = billsForMonth(state, month);
  const purchases = tx.filter((t) => t.type === 'purchase').length;
  const share = (list: Transaction[], name: string) =>
    total(list.filter((t) => t.category === name));
  const setup = setupProgress(state);
  return (
    <div className="dash-grid">
      {state.transactions.length === 0 && (
        <section className="card span-12 setup-card">
          <CardHeader
            title="Get started"
            subtitle="A few steps to a complete, private picture of September onward."
          />
          <ol className="setup-steps">
            <SetupStep
              done={setup.imported === setup.total}
              icon={Upload}
              title="Upload a statement for each account"
              detail={`${setup.imported} of ${setup.total} accounts imported. PDFs are read on this device.`}
              action={
                <button type="button" className="primary" onClick={onImport}>
                  Upload a statement
                </button>
              }
            />
            <SetupStep
              done={setup.september === setup.total}
              icon={CalendarCheck}
              title="Confirm September 1–30 coverage"
              detail={`${setup.september} of ${setup.total} accounts fully covered for September 2026.`}
              action={
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onNavigate('Accounts')}
                >
                  Review coverage
                </button>
              }
            />
            <SetupStep
              done={setup.bills > 0}
              icon={CalendarClock}
              title="Add scheduled bills (optional)"
              detail="Rent and utilities make month-end estimates more realistic."
              action={
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onNavigate('Recurring')}
                >
                  Add a bill
                </button>
              }
            />
            <SetupStep
              done={false}
              icon={ShieldCheck}
              title="Keep an encrypted backup"
              detail="Download one from Settings and store it with your offline recovery key."
              action={
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onNavigate('Settings')}
                >
                  Open Settings
                </button>
              }
            />
          </ol>
        </section>
      )}
      <section
        className="card spending-card span-8"
        aria-labelledby="spending-title"
      >
        <div className="card-header">
          <div>
            <h2 className="card-title" id="spending-title">
              Net spending
            </h2>
            <p className="card-subtitle">
              {monthLabel(month)} · {purchases}{' '}
              {purchases === 1 ? 'purchase' : 'purchases'}
            </p>
          </div>
          <Pill tone={complete ? 'good' : 'warn'}>
            {complete ? 'Covered' : 'Partial'}
          </Pill>
        </div>
        <p className="hero-amount" data-testid="net-spending">
          {money(actual)}
        </p>
        <p className="hero-sub">
          {comp.available ? (
            <>
              <Delta current={comp.current} previous={comp.previous} />
              <span>
                vs. {monthLabel(comp.prior)} · days 1–{comp.days}
              </span>
            </>
          ) : (
            <span>
              {month === firstMonth(state)
                ? 'Your first tracked month'
                : 'Add confirmed coverage to compare'}
            </span>
          )}
        </p>
        {comp.available && comp.partial && (
          <p className="fine-print">
            Comparison uses equal elapsed days (1–{comp.days}). Results stay
            partial until every account is covered for the month.
          </p>
        )}
        <SpendingChart
          points={series.points}
          monthName={monthShort(month)}
          currentLabel={monthLabel(month)}
          priorLabel={series.prior ? monthLabel(series.prior) : null}
        />
        <div className="legend">
          <span>
            <i className="swatch current" aria-hidden />
            {monthLabel(month)}
          </span>
          {series.prior && (
            <span>
              <i className="swatch prior" aria-hidden />
              {monthLabel(series.prior)}
            </span>
          )}
          <span className="legend-note">Running total by posted date</span>
        </div>
      </section>
      <div className="span-4 stack">
        <section
          className="card estimate-card"
          aria-labelledby="estimate-title"
        >
          <p className="eyebrow-label" id="estimate-title">
            <span>{projection?.label ?? 'Month-end estimate'}</span>
            <CircleHelp size={15} aria-hidden />
          </p>
          <p className="stat-amount">
            {projection ? money(projection.cents) : '—'}
          </p>
          <p className="fine-print">
            {projection
              ? 'Planning only · never added to actual spending'
              : month < todayNY().slice(0, 7)
                ? 'Past month · actual spending shown'
                : 'Needs aligned coverage or a complete prior month'}
          </p>
          {projection && <p className="estimate-detail">{projection.detail}</p>}
        </section>
        <section className="card review-card" aria-labelledby="review-title">
          <CardHeader
            title="Needs review"
            subtitle={
              uncategorized.length
                ? `${money(total(uncategorized))} uncategorized still counts`
                : 'Every purchase has a category'
            }
          />
          {uncategorized.length ? (
            <>
              <ul className="mini-list">
                {uncategorized.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="mini-row"
                      aria-label={`Categorize ${t.merchant}`}
                      onClick={() => onEdit(t)}
                    >
                      <TriangleAlert
                        size={15}
                        className="warn-icon"
                        aria-hidden
                      />
                      <span className="mini-name">{t.merchant}</span>
                      <span className="mini-value">{money(net(t))}</span>
                      <ChevronRight size={15} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {uncategorized.length > 3 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onFilter({ category: 'Uncategorized' })}
                >
                  Review all {uncategorized.length}
                  <ChevronRight size={15} aria-hidden />
                </button>
              )}
            </>
          ) : (
            <p className="all-clear">
              <CircleCheck size={18} aria-hidden />
              All caught up
            </p>
          )}
        </section>
      </div>
      <section className="card span-6" aria-labelledby="categories-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="categories-title">
              Spending by category
            </h2>
            <p className="card-subtitle">
              Select a category for merchants and exact transactions.
            </p>
          </div>
        </div>
        {categories.length ? (
          <>
            <ul className={comp.available ? 'rank-list' : 'rank-list no-delta'}>
              {categories.slice(0, TOP).map((g) => (
                <li key={g.name}>
                  <button
                    type="button"
                    className="rank-row"
                    aria-label={g.name}
                    aria-describedby={`cat-${g.name.replace(/\W/g, '')}`}
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
                      {comp.available ? (
                        <Delta
                          compact
                          current={share(comp.currentTransactions, g.name)}
                          previous={share(comp.previousTransactions, g.name)}
                        />
                      ) : null}
                    </span>
                    <span
                      className="sr-only"
                      id={`cat-${g.name.replace(/\W/g, '')}`}
                    >
                      {money(g.cents)}, {Math.round(g.share * 100)}% of spending
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {categories.length > TOP && (
              <button
                type="button"
                className="text-button card-link"
                onClick={() => onNavigate('Cash flow')}
              >
                See all {categories.length} categories
                <ChevronRight size={15} aria-hidden />
              </button>
            )}
          </>
        ) : (
          <EmptyState
            icon={Upload}
            title="No spending recorded yet"
            action={
              <>
                <button type="button" className="primary" onClick={onImport}>
                  <Upload size={16} aria-hidden />
                  Upload a statement
                </button>
                <button type="button" className="secondary" onClick={onAdd}>
                  <Plus size={16} aria-hidden />
                  Add expense
                </button>
              </>
            }
          >
            Upload your first statement to see category details for{' '}
            {monthLabel(month)}.
          </EmptyState>
        )}
      </section>
      <section className="card span-6" aria-labelledby="monthly-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="monthly-title">
              Monthly comparison
            </h2>
            <p className="card-subtitle">
              Actual spending, with estimates shown separately.
            </p>
          </div>
        </div>
        <MonthlyChart data={months} />
        <div className="legend">
          <span>
            <i className="swatch current" aria-hidden />
            Actual
          </span>
          <span>
            <i className="swatch estimated" aria-hidden />
            Estimate
          </span>
        </div>
        <ul className="month-list">
          {[...months].reverse().map((m) => (
            <li key={m.month} className={m.month === month ? 'selected' : ''}>
              <span className="month-name">
                {monthLabel(m.month)}
                <span className="month-cover">
                  {m.complete ? 'Covered' : 'Partial coverage'}
                </span>
              </span>
              <span className="month-change">
                {m.comp.available ? (
                  <>
                    <Delta
                      current={m.comp.current}
                      previous={m.comp.previous}
                    />
                    <span className="month-cover">Days 1–{m.comp.days}</span>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span className="month-actual">
                {money(m.actual)}
                {m.estimate !== undefined && (
                  <span className="month-cover">est. {money(m.estimate)}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card span-8" aria-labelledby="recent-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="recent-title">
              Recent transactions
            </h2>
            <p className="card-subtitle">
              The latest entries for {monthLabel(month)}.
            </p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onFilter({})}
          >
            View all
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
        <TransactionList
          transactions={[...tx]
            .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
            .slice(0, 6)}
          onEdit={onEdit}
          empty={
            <EmptyState icon={ArrowLeftRight} title="No transactions here yet.">
              Imported and manual entries for {monthLabel(month)} appear here.
            </EmptyState>
          }
        />
      </section>
      <section className="card span-4" aria-labelledby="bills-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="bills-title">
              Bills this month
            </h2>
            <p className="card-subtitle">
              {bills.bills.length
                ? `${bills.linked} of ${bills.bills.length} payments linked`
                : 'Optional planning'}
            </p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate('Recurring')}
          >
            Manage
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
        {bills.bills.length ? (
          <ul className="bill-list">
            {bills.bills.map(({ bill, due, status, upcoming }) => (
              <li key={bill.id}>
                <CategoryIcon name={bill.category} />
                <span className="bill-name">
                  {bill.name}
                  <span>Due {shortDate(due)}</span>
                </span>
                <span className="bill-amount">
                  {money(bill.amountCents)}
                  <Pill tone={billLabel(status, upcoming)[1]}>
                    {billLabel(status, upcoming)[0]}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={CalendarClock} title="No scheduled bills">
            Add rent or utilities in Recurring to plan around them.
          </EmptyState>
        )}
      </section>
      <section className="card span-12" aria-labelledby="accounts-title">
        <div className="card-header">
          <div>
            <h2 className="card-title" id="accounts-title">
              Your accounts
            </h2>
            <p className="card-subtitle">
              Coverage is confirmed separately from transaction dates · Last
              saved{' '}
              {state.updatedAt
                ? new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/New_York',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(state.updatedAt))
                : 'never'}
            </p>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => onNavigate('Accounts')}
          >
            Details
            <ChevronRight size={15} aria-hidden />
          </button>
        </div>
        <div className="account-grid">
          {covered.map((c) => (
            <AccountTile
              key={c.account}
              account={c.account}
              cents={total(tx.filter((t) => t.account === c.account))}
              coverage={c}
              notice={updateNotice(state, c.account)}
              activity={accountActivity(state, c.account)}
              onTransactions={() => onFilter({ account: c.account })}
            />
          ))}
        </div>
      </section>
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
function SetupStep({
  done,
  icon: Icon,
  title,
  detail,
  action,
}: {
  done: boolean;
  icon: typeof Upload;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <li className={done ? 'setup-step done' : 'setup-step'}>
      <span className="setup-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <span className="setup-text">
        <strong>
          {done ? (
            <CircleCheck size={15} className="credit" aria-hidden />
          ) : (
            <Circle size={15} className="muted" aria-hidden />
          )}
          {title}
          <span className="sr-only">{done ? ' (done)' : ' (to do)'}</span>
        </strong>
        <span>{detail}</span>
      </span>
      {!done && action}
    </li>
  );
}
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
export function AccountTile({
  account,
  cents,
  coverage,
  notice,
  activity,
  onTransactions,
  children,
}: {
  account: Account;
  cents: number;
  coverage: ReturnType<typeof accountCoverage>;
  notice: string | null;
  activity?: { lastImport?: string; coveredThrough?: string };
  onTransactions: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="account-tile">
      <div className="account-title">
        <AccountBadge account={account} />
        <h3>{account}</h3>
        <Pill tone={coverage.complete ? 'good' : 'warn'}>
          {coverage.complete ? 'Covered' : 'Partial'}
        </Pill>
      </div>
      <p className="account-amount">
        {money(cents)} <span>net spending</span>
      </p>
      <Progress
        value={coverage.covered / Math.max(1, coverage.endDay)}
        tone={coverage.complete ? 'c-green' : 'c-amber'}
      />
      <p className="account-cover">
        {coverage.covered} of {coverage.endDay} days covered
        {coverage.ranges.length > 0 && (
          <span>
            {coverage.ranges.map((r) => `${r.from} – ${r.through}`).join('; ')}
          </span>
        )}
      </p>
      {activity && (
        <p className="account-activity">
          {activity.lastImport
            ? `Last import ${dateTime(activity.lastImport)}`
            : 'No imports yet'}
          {activity.coveredThrough &&
            ` · covered through ${shortDate(activity.coveredThrough)}`}
        </p>
      )}
      {coverage.gaps.length > 0 && (
        <details className="gaps">
          <summary>{coverage.gaps.length} uncovered days</summary>
          <p>{coverage.gaps.join(', ')}</p>
        </details>
      )}
      {notice && (
        <p className="account-notice">
          <TriangleAlert size={14} aria-hidden />
          {notice}
        </p>
      )}
      {children}
      <button type="button" className="text-button" onClick={onTransactions}>
        View {account} transactions
        <ChevronRight size={15} aria-hidden />
      </button>
    </div>
  );
}
