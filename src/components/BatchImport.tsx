'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Copy,
  FileText,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { parsePdf } from '@/lib/pdf-client';
import type { PdfStatement } from '@/lib/pdf-types';
import type { Account, TrackerState } from '@/lib/model';
import type { PreviewRow } from '@/lib/imports';
import {
  autoPrepare,
  commitBatch,
  previewBatch,
  sameStatement,
  type Prepared,
} from '@/lib/batch';
import { money } from '@/lib/accounting';
import { shortDate } from '@/lib/insights';
import PdfReview from './PdfReview';
import { Notice, Pill, Spinner } from './ui';
import { readableError } from './ExpenseDialog';
type Item = {
  id: string;
  name: string;
  status: 'reading' | 'ready' | 'review' | 'failed' | 'duplicate';
  statement?: PdfStatement;
  prepared?: Prepared;
  reviewed?: boolean;
  reasons: string[];
};
const day = (iso: string) => shortDate(iso).replace(/^\w+, /, '');
const period = (s?: PdfStatement) =>
  s?.cycleFrom && s.cycleThrough
    ? `${day(s.cycleFrom)} – ${day(s.cycleThrough)}, ${s.cycleThrough.slice(0, 4)}`
    : s?.cycleThrough
      ? `Period ending ${day(s.cycleThrough)}, ${s.cycleThrough.slice(0, 4)}`
      : undefined;
const BATCH_CHECKS = [
  [
    'dates',
    'I checked posted dates (Amex can show the purchase date for charges)',
  ],
  ['sections', 'Each file is a complete statement, every page included'],
  ['types', 'Card payments are marked as transfers'],
] as const;
export default function BatchImport({
  files,
  account,
  state,
  busy,
  save,
  onSaved,
  onCancel,
}: {
  files: File[];
  account: Account;
  state: TrackerState;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  onSaved?: (message: string) => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    files.map((f, i) => ({
      id: String(i),
      name: f.name,
      status: 'reading',
      reasons: [],
    })),
  );
  const [reviewing, setReviewing] = useState<string | null>(null),
    [checks, setChecks] = useState({
      dates: false,
      sections: false,
      types: false,
    }),
    [previews, setPreviews] = useState<PreviewRow[][] | null>(null),
    [coverageConfirmed, setCoverageConfirmed] = useState(false),
    [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  // Read files one at a time: each gets its own isolated worker and limits.
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    (async () => {
      const read: PdfStatement[] = [];
      for (let i = 0; i < files.length; i++) {
        if (active.signal.aborted) return;
        let next: Partial<Item>;
        try {
          const statement = await parsePdf(files[i], account, active.signal);
          if (read.some((s) => sameStatement(s, statement)))
            next = {
              status: 'duplicate',
              statement,
              reasons: ['Same statement as another file in this batch'],
            };
          else {
            read.push(statement);
            const { prepared, reasons } = autoPrepare(statement);
            next = {
              status: prepared ? 'ready' : 'review',
              statement,
              prepared,
              reasons,
            };
          }
        } catch (e) {
          next = {
            status: 'failed',
            reasons: [e instanceof Error ? e.message : 'Could not be read.'],
          };
        }
        if (active.signal.aborted) return;
        setItems((all) =>
          all.map((it) => (it.id === String(i) ? { ...it, ...next } : it)),
        );
      }
    })();
    return () => active.abort();
  }, [files, account]);
  const reading = items.some((i) => i.status === 'reading'),
    ready = items
      .filter((i) => i.status === 'ready' && i.prepared)
      .sort((a, b) =>
        (a.statement?.cycleThrough ?? '').localeCompare(
          b.statement?.cycleThrough ?? '',
        ),
      ),
    waiting = items.filter((i) => i.status === 'review').length,
    autoChecked = ready.some((i) => !i.reviewed),
    checked = !autoChecked || (checks.dates && checks.sections && checks.types);
  const decisions = previews?.flat() ?? [],
    open = decisions.filter((r) => r.decision === 'review').length,
    adding = decisions.filter(
      (r) => r.transaction && r.decision === 'include',
    ).length;
  const matched = useMemo(() => {
    const byId = new Map(state.transactions.map((t) => [t.id, t]));
    for (const rows of previews ?? [])
      for (const r of rows)
        if (r.transaction) byId.set(r.transaction.id, r.transaction);
    return byId;
  }, [state, previews]);
  function update(id: string, patch: Partial<Item>) {
    setItems((all) =>
      all.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  }
  function decide(s: number, row: number, decision: PreviewRow['decision']) {
    setPreviews((all) =>
      all!.map((rows, i) =>
        i === s
          ? rows.map((r, j) => (j === row ? { ...r, decision } : r))
          : rows,
      ),
    );
  }
  const item = items.find((i) => i.id === reviewing);
  if (item?.statement)
    return (
      <div className="batch">
        <button
          type="button"
          className="text-button"
          onClick={() => setReviewing(null)}
        >
          <ArrowLeft size={16} aria-hidden />
          Back to all statements
        </button>
        <PdfReview
          statement={item.statement}
          onPrepared={(prepared) => {
            update(item.id, {
              prepared,
              status: 'ready',
              reviewed: true,
              reasons: [],
            });
            setReviewing(null);
          }}
        />
      </div>
    );
  if (previews)
    return (
      <div className="batch">
        <div className="review-head">
          <h3>Confirm {ready.length} statements</h3>
          <p className="fine-print">
            {adding} new {adding === 1 ? 'transaction' : 'transactions'} across{' '}
            {ready.length} statements. Each statement is saved as its own
            import, so you can undo any one of them later in Settings.
          </p>
        </div>
        {open > 0 ? (
          <>
            <h4 className="section-label">
              {open} possible {open === 1 ? 'duplicate' : 'duplicates'} to
              decide
            </h4>
            <ul className="batch-decisions">
              {previews.map((rows, s) =>
                rows.map((r, j) => {
                  if (!r.matchId || r.matchKind === 'stable' || !r.transaction)
                    return null;
                  const other = matched.get(r.matchId);
                  return (
                    <li key={`${s}-${j}`}>
                      <span className="batch-decision-text">
                        <strong>{r.transaction.merchant}</strong>
                        <span>
                          {money(r.transaction.amountCents)} ·{' '}
                          {day(r.transaction.postedDate)} ·{' '}
                          {period(ready[s].statement)}
                        </span>
                        {other && (
                          <span className="cell-warn">
                            {other.source === 'manual'
                              ? `Looks like your entry "${other.merchant}" on ${day(other.postedDate)}.`
                              : `Matches "${other.merchant}" on ${day(other.postedDate)} already in your records or another file.`}
                          </span>
                        )}
                      </span>
                      <select
                        aria-label={`Action for ${r.transaction.merchant} on ${r.transaction.postedDate}`}
                        value={r.decision}
                        onChange={(e) =>
                          decide(s, j, e.target.value as PreviewRow['decision'])
                        }
                      >
                        <option value="review">Choose…</option>
                        <option value="link">
                          Same transaction · keep existing
                        </option>
                        <option value="include">
                          Add as separate purchase
                        </option>
                        <option value="skip">Skip</option>
                      </select>
                    </li>
                  );
                }),
              )}
            </ul>
          </>
        ) : (
          <Notice tone="success">
            No possible duplicates. Every transaction is new.
          </Notice>
        )}
        <div className="coverage-confirm">
          <h3>Coverage</h3>
          <p className="fine-print">
            Marks each statement&apos;s own period as complete for {account}, so
            months covered by consecutive statements count as fully covered.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={coverageConfirmed}
              onChange={(e) => setCoverageConfirmed(e.target.checked)}
            />
            These statements include every posted transaction for their periods.
          </label>
        </div>
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        {open > 0 && (
          <p className="blocking-hint">
            <TriangleAlert size={15} aria-hidden />
            Choose an action for {open} possible{' '}
            {open === 1 ? 'duplicate' : 'duplicates'} to continue.
          </p>
        )}
        <div className="modal-actions sticky-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setPreviews(null)}
          >
            <ArrowLeft size={16} aria-hidden />
            Back
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || open > 0}
            onClick={async () => {
              try {
                const next = commitBatch(
                  state,
                  account,
                  ready.map((it, i) => ({
                    rows: previews[i],
                    proof: it.prepared!.proof,
                    coverage:
                      coverageConfirmed &&
                      it.statement?.cycleFrom &&
                      it.statement.cycleThrough
                        ? {
                            from: it.statement.cycleFrom,
                            through: it.statement.cycleThrough,
                          }
                        : undefined,
                  })),
                );
                await save(next);
                const added = next.batches
                  .slice(state.batches.length)
                  .reduce((sum, b) => sum + b.added, 0);
                onSaved?.(
                  `${ready.length} ${account} statements imported · ${added} added`,
                );
              } catch (e) {
                setError(readableError(e, 'Import failed.'));
              }
            }}
          >
            {busy ? <Spinner /> : <Upload size={16} aria-hidden />}
            {busy ? 'Saving…' : `Import ${ready.length} statements`}
          </button>
        </div>
      </div>
    );
  return (
    <div className="batch">
      <div className="review-head">
        <h3>
          {reading
            ? `Reading ${items.filter((i) => i.status !== 'reading').length + 1} of ${items.length} statements…`
            : `${items.length} statements read`}
        </h3>
        <p className="fine-print">
          Each file is read on this device in its own isolated worker.
          Statements that balance against their printed totals are ready; open
          any of them to check rows.
        </p>
      </div>
      <ul className="batch-list">
        {items.map((it) => (
          <li key={it.id} className={`batch-item ${it.status}`}>
            <span className="batch-icon" aria-hidden>
              {it.status === 'reading' ? (
                <Spinner />
              ) : it.status === 'ready' ? (
                <CircleCheck size={18} />
              ) : it.status === 'duplicate' ? (
                <Copy size={18} />
              ) : it.status === 'failed' ? (
                <CircleAlert size={18} />
              ) : (
                <FileText size={18} />
              )}
            </span>
            <span className="batch-text">
              <strong>{period(it.statement) ?? it.name}</strong>
              <span>
                {it.statement
                  ? `${it.statement.rows.length} ${it.statement.rows.length === 1 ? 'transaction' : 'transactions'} · ${it.name}`
                  : it.status === 'reading'
                    ? 'Reading…'
                    : it.name}
              </span>
              {it.reasons.length > 0 && (
                <span className="cell-warn">{it.reasons.join(' · ')}</span>
              )}
            </span>
            <span className="batch-actions">
              {it.status === 'ready' && (
                <Pill tone="good">{it.reviewed ? 'Reviewed' : 'Balances'}</Pill>
              )}
              {it.status === 'review' && <Pill tone="warn">Needs review</Pill>}
              {it.status === 'duplicate' && (
                <Pill tone="neutral">Duplicate</Pill>
              )}
              {it.status === 'failed' && <Pill tone="bad">Not read</Pill>}
              {(it.status === 'review' || it.status === 'ready') && (
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Review ${period(it.statement) ?? it.name}`}
                  onClick={() => setReviewing(it.id)}
                >
                  Review
                </button>
              )}
              {it.status !== 'reading' && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${period(it.statement) ?? it.name}`}
                  onClick={() =>
                    setItems((all) => all.filter((x) => x.id !== it.id))
                  }
                >
                  <Trash2 size={16} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {autoChecked && !reading && (
        <fieldset className="checklist">
          <legend>Before importing statements that balance</legend>
          {BATCH_CHECKS.map(([key, label]) => (
            <label key={key} className="check">
              <input
                type="checkbox"
                checked={checks[key]}
                onChange={(e) =>
                  setChecks({ ...checks, [key]: e.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
      {waiting > 0 && !reading && (
        <p className="blocking-hint">
          <TriangleAlert size={15} aria-hidden />
          {waiting} {waiting === 1 ? 'statement needs' : 'statements need'}{' '}
          review. Review {waiting === 1 ? 'it' : 'them'}, or continue and{' '}
          {waiting === 1 ? 'it' : 'they'} will be left out.
        </p>
      )}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="modal-actions sticky-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            controller.current?.abort();
            onCancel();
          }}
        >
          {reading ? 'Cancel' : 'Start over'}
        </button>
        <button
          type="button"
          className="primary"
          disabled={reading || !ready.length || !checked}
          onClick={() => {
            try {
              setPreviews(
                previewBatch(
                  state,
                  account,
                  ready.map((i) => i.prepared!),
                ),
              );
              setCoverageConfirmed(false);
              setError('');
            } catch (e) {
              setError(readableError(e, 'Check the statements.'));
            }
          }}
        >
          Continue with {ready.length}{' '}
          {ready.length === 1 ? 'statement' : 'statements'}
        </button>
      </div>
    </div>
  );
}
