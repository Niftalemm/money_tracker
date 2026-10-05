'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarClock,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Download,
  Ellipsis,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  Settings as SettingsIcon,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import AuthGate from './AuthGate';
import Brand from './Brand';
import Dashboard from './Dashboard';
import Transactions, { NO_FILTERS, type Filters } from './Transactions';
import CashFlow from './CashFlow';
import Accounts from './Accounts';
import Recurring from './Recurring';
import Settings from './Settings';
import ImportDialog from './ImportDialog';
import ExpenseDialog from './ExpenseDialog';
import Modal from './Modal';
import { Notice, Spinner } from './ui';
import { accountCoverage, monthLabel, trackedMonths } from '@/lib/accounting';
import { exportExcel } from '@/lib/exports';
import { ACCOUNTS, type Transaction } from '@/lib/model';
type Context = Parameters<Parameters<typeof AuthGate>[0]['children']>[0];
export type View =
  | 'Dashboard'
  | 'Transactions'
  | 'Cash flow'
  | 'Accounts'
  | 'Recurring'
  | 'Settings';
const NAV: [View, LucideIcon][] = [
  ['Dashboard', LayoutDashboard],
  ['Transactions', ArrowLeftRight],
  ['Cash flow', ChartColumn],
  ['Accounts', Landmark],
  ['Recurring', CalendarClock],
];
const MORE: [View, LucideIcon, string][] = [
  ['Accounts', Landmark, 'Coverage and statement updates'],
  ['Recurring', CalendarClock, 'Scheduled bills and payments'],
  ['Settings', SettingsIcon, 'Categories, imports, and backups'],
];
const SUBTITLE: Record<View, string> = {
  Dashboard: '',
  Transactions: 'Purchases, credits, and payments. Select one to edit it.',
  'Cash flow': 'Recorded income, spending, and where the money went.',
  Accounts: 'Confirmed coverage and statement updates for each account.',
  Recurring: 'Scheduled bills and whether a payment has been recorded.',
  Settings: 'Categories, merchant rules, import history, and backups.',
};
export type Notify = (message: string) => void;
function Workspace(ctx: Context) {
  const [view, setView] = useState<View>('Dashboard'),
    [month, setMonth] = useState('2026-09'),
    [importing, setImporting] = useState(false),
    [expense, setExpense] = useState<Transaction | 'new' | null>(null),
    [message, setMessage] = useState(''),
    [toast, setToast] = useState<{ id: number; text: string } | null>(null),
    [exporting, setExporting] = useState(false),
    [more, setMore] = useState(false),
    [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const { state, demo, busy, save } = ctx;
  const months = trackedMonths(),
    index = months.indexOf(month);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const notify: Notify = (text) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };
  function go(next: View) {
    setView(next);
    setMore(false);
    window.scrollTo({ top: 0 });
  }
  const covered = ACCOUNTS.every(
    (a) => accountCoverage(state, a, month).complete,
  );
  const subtitle =
    view === 'Dashboard'
      ? `${monthLabel(month)} · ${covered ? 'All accounts covered' : 'Coverage still partial'}`
      : SUBTITLE[view];
  const lockLabel = demo ? 'Exit demo' : 'Lock & sign out';
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <button
            type="button"
            className="brand-button"
            aria-label="Money Tracker home"
            onClick={() => go('Dashboard')}
          >
            <Brand />
          </button>
          <nav aria-label="Main navigation" className="top-nav">
            {NAV.map(([name]) => (
              <button
                key={name}
                type="button"
                className="top-link"
                aria-current={view === name ? 'page' : undefined}
                onClick={() => go(name)}
              >
                {name}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <button
              type="button"
              className="icon-button top-settings"
              aria-label="Settings"
              aria-current={view === 'Settings' ? 'page' : undefined}
              onClick={() => go('Settings')}
            >
              <SettingsIcon size={19} aria-hidden />
            </button>
            <button
              type="button"
              className="lock-button"
              aria-label={lockLabel}
              onClick={ctx.lock}
            >
              <LockKeyhole size={17} aria-hidden />
              <span className="label-full">{lockLabel}</span>
            </button>
          </div>
        </div>
      </header>
      <div className="app-main">
        {demo && (
          <div className="demo-banner">
            <span className="status-dot" aria-hidden />
            <span>
              <strong>Demo workspace</strong> · synthetic data only
            </span>
            <span className="demo-banner-extra">
              Changes reset when you leave
            </span>
          </div>
        )}
        <main className="content" id="main">
          <div className="page-head">
            <div className="page-title">
              <h1>{view}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="page-actions">
              {view !== 'Settings' && (
                <div className="month-switcher">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Previous month"
                    disabled={index <= 0}
                    onClick={() => setMonth(months[index - 1])}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <select
                    aria-label="Selected month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {monthLabel(m)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Next month"
                    disabled={index >= months.length - 1}
                    onClick={() => setMonth(months[index + 1])}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              )}
              <button
                type="button"
                className="secondary action-compact"
                aria-label="Download Excel"
                onClick={() => setExporting(true)}
              >
                <Download size={16} aria-hidden />
                <span className="label-short">Excel</span>
                <span className="label-full">Download Excel</span>
              </button>
              <button
                type="button"
                className="secondary desktop-only"
                disabled={busy}
                onClick={() => setExpense('new')}
              >
                <Plus size={17} aria-hidden />
                Add expense
              </button>
              <button
                type="button"
                className="primary action-compact"
                aria-label="Upload transactions"
                disabled={busy}
                onClick={() => setImporting(true)}
              >
                <Upload size={16} aria-hidden />
                <span className="label-short">Upload</span>
                <span className="label-full">Upload transactions</span>
              </button>
            </div>
          </div>
          {message && (
            <Notice tone="error" role="alert" onDismiss={() => setMessage('')}>
              {message}
            </Notice>
          )}
          {view === 'Dashboard' && (
            <Dashboard
              state={state}
              month={month}
              onEdit={setExpense}
              onNavigate={go}
              onFilter={(next) => {
                setFilters({ ...NO_FILTERS, ...next });
                go('Transactions');
              }}
              onImport={() => setImporting(true)}
              onAdd={() => setExpense('new')}
            />
          )}
          {view === 'Transactions' && (
            <Transactions
              state={state}
              month={month}
              filters={filters}
              onFilters={setFilters}
              onEdit={setExpense}
              onAdd={() => setExpense('new')}
            />
          )}
          {view === 'Cash flow' && (
            <CashFlow state={state} month={month} onEdit={setExpense} />
          )}
          {view === 'Accounts' && (
            <Accounts
              {...ctx}
              month={month}
              notify={notify}
              onError={setMessage}
              onTransactions={(account) => {
                setFilters({ ...NO_FILTERS, account });
                go('Transactions');
              }}
            />
          )}
          {view === 'Recurring' && (
            <Recurring
              {...ctx}
              month={month}
              notify={notify}
              onError={setMessage}
            />
          )}
          {view === 'Settings' && (
            <Settings {...ctx} notify={notify} onError={setMessage} />
          )}
          <footer className="app-footer">
            <span>
              <LockKeyhole size={13} aria-hidden />
              {demo
                ? 'Demo data stays on this page'
                : 'Encrypted on this device before cloud storage'}
            </span>
            <span>USD · New York time · Tracking from September 2026</span>
          </footer>
        </main>
      </div>
      <nav className="tabbar" aria-label="Mobile navigation">
        {(
          [
            ['Dashboard', LayoutDashboard],
            ['Transactions', ArrowLeftRight],
          ] as const
        ).map(([name, Icon]) => (
          <button
            key={name}
            type="button"
            className="tab"
            aria-current={view === name ? 'page' : undefined}
            onClick={() => go(name)}
          >
            <Icon size={21} aria-hidden />
            <span>{name}</span>
          </button>
        ))}
        <button
          type="button"
          className="tab tab-add"
          aria-label="Add expense"
          disabled={busy}
          onClick={() => setExpense('new')}
        >
          <span className="tab-add-circle">
            <Plus size={24} aria-hidden />
          </span>
          <span>Add</span>
        </button>
        <button
          type="button"
          className="tab"
          aria-current={view === 'Cash flow' ? 'page' : undefined}
          onClick={() => go('Cash flow')}
        >
          <ChartColumn size={21} aria-hidden />
          <span>Cash flow</span>
        </button>
        <button
          type="button"
          className="tab"
          aria-haspopup="dialog"
          aria-current={
            ['Accounts', 'Recurring', 'Settings'].includes(view)
              ? 'page'
              : undefined
          }
          onClick={() => setMore(true)}
        >
          <Ellipsis size={21} aria-hidden />
          <span>More</span>
        </button>
      </nav>
      <div className="toast-region" role="status" aria-live="polite">
        {busy && (
          <div className="toast busy">
            <Spinner />
            Encrypting and saving…
          </div>
        )}
        {toast && !busy && (
          <div className="toast" key={toast.id}>
            <CircleCheck size={18} className="toast-check" aria-hidden />
            {toast.text}
          </div>
        )}
      </div>
      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          <div className="more-list">
            {MORE.map(([name, Icon, hint]) => (
              <button
                key={name}
                type="button"
                className="more-link"
                aria-label={name}
                aria-describedby={`more-${name}`}
                aria-current={view === name ? 'page' : undefined}
                onClick={() => go(name)}
              >
                <span className="more-icon">
                  <Icon size={19} aria-hidden />
                </span>
                <span>
                  {name}
                  <span className="more-hint" id={`more-${name}`}>
                    {hint}
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden />
              </button>
            ))}
          </div>
          <div className="vault-status">
            <ShieldCheck size={16} aria-hidden />
            <div>
              <strong>{demo ? 'Demo workspace' : 'Encrypted vault'}</strong>
              <span>
                {demo
                  ? 'Synthetic data · resets on exit'
                  : 'Keys stay in memory · locks after 10 min idle'}
              </span>
            </div>
          </div>
        </Modal>
      )}
      {exporting && (
        <ExportDialog
          month={month}
          onClose={() => setExporting(false)}
          onExport={async (all) => {
            await exportExcel(state, all ? undefined : month);
            setExporting(false);
            notify('Excel file downloaded');
          }}
        />
      )}
      {importing && (
        <ImportDialog
          state={state}
          busy={busy}
          save={save}
          onSaved={notify}
          onClose={() => setImporting(false)}
        />
      )}
      {expense && (
        <ExpenseDialog
          state={state}
          busy={busy}
          transaction={expense === 'new' ? undefined : expense}
          month={month}
          save={save}
          onSaved={notify}
          onClose={() => setExpense(null)}
        />
      )}
    </div>
  );
}
function ExportDialog({
  month,
  onClose,
  onExport,
}: {
  month: string;
  onClose: () => void;
  onExport: (all: boolean) => Promise<void>;
}) {
  const [all, setAll] = useState(false),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      title="Download Excel"
      onClose={onClose}
      description="Generated on this device with Transactions and Monthly summary sheets."
    >
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <fieldset className="choice-group">
        <legend className="sr-only">Months to include</legend>
        <label className={!all ? 'choice selected' : 'choice'}>
          <input
            type="radio"
            name="export-range"
            checked={!all}
            onChange={() => setAll(false)}
          />
          <span>
            {monthLabel(month)} only
            <span className="choice-hint">The month you are viewing</span>
          </span>
        </label>
        <label className={all ? 'choice selected' : 'choice'}>
          <input
            type="radio"
            name="export-range"
            checked={all}
            onChange={() => setAll(true)}
          />
          <span>
            All months
            <span className="choice-hint">Everything since September 2026</span>
          </span>
        </label>
      </fieldset>
      <Notice tone="warn">
        Excel files are readable copies. Keep them private. Use the encrypted
        backup in Settings for full recovery.
      </Notice>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            setError('');
            try {
              await onExport(all);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : 'The Excel file failed.',
              );
              setWorking(false);
            }
          }}
        >
          {working ? <Spinner /> : <Download size={16} aria-hidden />}
          {working ? 'Preparing…' : 'Download'}
        </button>
      </div>
    </Modal>
  );
}
export default function Tracker() {
  return <AuthGate>{(ctx) => <Workspace {...ctx} />}</AuthGate>;
}
