'use client';
import { useState } from 'react';
import {
  Wallet,
  LayoutDashboard,
  List,
  Settings as SettingsIcon,
  LockKeyhole,
  Plus,
  Upload,
  Download,
  ArrowUpRight,
} from 'lucide-react';
import AuthGate from './AuthGate';
import Dashboard from './Dashboard';
import Transactions from './Transactions';
import Settings from './Settings';
import ImportDialog from './ImportDialog';
import ExpenseDialog from './ExpenseDialog';
import { monthLabel, trackedMonths } from '@/lib/accounting';
import { exportExcel } from '@/lib/exports';
import type { Transaction } from '@/lib/model';
type Context = Parameters<Parameters<typeof AuthGate>[0]['children']>[0];
function Workspace(ctx: Context) {
  const [view, setView] = useState<'Dashboard' | 'Transactions' | 'Settings'>(
      'Dashboard',
    ),
    [month, setMonth] = useState('2026-09'),
    [importing, setImporting] = useState(false),
    [expense, setExpense] = useState<Transaction | 'new' | null>(null),
    [message, setMessage] = useState(''),
    [exportAll, setExportAll] = useState(false);
  const { state, demo, busy, save } = ctx;
  async function handle(fn: () => Promise<void>) {
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Unable to complete this action.',
      );
    }
  }
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setView('Dashboard');
            }}
          >
            <span className="brand-mark">
              <Wallet size={20} />
            </span>
            money tracker
          </a>
          <nav aria-label="Main navigation">
            {[
              ['Dashboard', LayoutDashboard],
              ['Transactions', List],
              ['Settings', SettingsIcon],
            ].map(([name, Icon]) => {
              const Component = Icon as typeof Wallet;
              return (
                <button
                  key={name as string}
                  className={view === name ? 'active' : ''}
                  onClick={() => setView(name as typeof view)}
                >
                  <Component size={17} />
                  {name as string}
                </button>
              );
            })}
          </nav>
          <button className="lock-button" onClick={ctx.lock}>
            <LockKeyhole size={16} />
            <span>{demo ? 'Exit demo' : 'Lock & sign out'}</span>
          </button>
        </div>
      </header>
      <main className="main-shell">
        {demo && (
          <div className="demo-banner">
            <span>
              <span className="status-dot" />
              Demo workspace · Synthetic data only
            </span>
            <span>Changes reset when you leave</span>
          </div>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {view === 'Dashboard'
                ? 'YOUR MONTH, AT A GLANCE'
                : view === 'Transactions'
                  ? 'THE DETAILS BEHIND THE TOTAL'
                  : 'MAKE IT YOURS'}
            </p>
            <h1>{view === 'Dashboard' ? 'Let’s see where it went.' : view}</h1>
            <p className="muted">
              {view === 'Dashboard'
                ? 'A clearer picture of your everyday spending.'
                : view === 'Transactions'
                  ? 'Purchases, credits, and payments — all in one place.'
                  : 'Your accounts, categories, coverage, and encrypted backups.'}
            </p>
          </div>
          <label className="month-picker">
            <span>Month</span>
            <select
              aria-label="Selected month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {trackedMonths().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {message && (
          <div className="alert error" role="alert">
            {message}
            <button className="text-button" onClick={() => setMessage('')}>
              Dismiss
            </button>
          </div>
        )}
        <div className="toolbar">
          <div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => setImporting(true)}
            >
              <Upload size={16} />
              Upload transactions
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setExpense('new')}
            >
              <Plus size={17} />
              Add expense
            </button>
          </div>
          <div className="export-controls">
            <label className="check">
              <input
                type="checkbox"
                checked={exportAll}
                onChange={(e) => setExportAll(e.target.checked)}
              />
              All months
            </label>
            <button
              className="text-button"
              onClick={() =>
                void handle(() =>
                  exportExcel(state, exportAll ? undefined : month),
                )
              }
            >
              <Download size={16} />
              Download Excel
            </button>
          </div>
        </div>
        {busy && (
          <p className="small muted" role="status">
            Encrypting and saving…
          </p>
        )}
        {view === 'Dashboard' && (
          <Dashboard
            state={state}
            month={month}
            onEdit={setExpense}
            onTransactions={() => setView('Transactions')}
          />
        )}
        {view === 'Transactions' && (
          <Transactions state={state} month={month} onEdit={setExpense} />
        )}
        {view === 'Settings' && (
          <Settings {...ctx} onError={setMessage} month={month} />
        )}
        <footer className="app-footer">
          <span>
            <LockKeyhole size={13} />
            {demo
              ? 'Demo data stays on this page'
              : 'Encrypted before cloud storage'}
          </span>
          <span>
            USD · New York time <ArrowUpRight size={12} />
          </span>
        </footer>
      </main>
      {importing && (
        <ImportDialog
          state={state}
          busy={busy}
          save={save}
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
          onClose={() => setExpense(null)}
        />
      )}
    </>
  );
}
export default function Tracker() {
  return <AuthGate>{(ctx) => <Workspace {...ctx} />}</AuthGate>;
}
