'use client';
import { useState } from 'react';
import { CircleCheck, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { TYPES } from '@/lib/model';
import { money } from '@/lib/accounting';
import {
  PDF_GROUPS,
  GROUP_LABELS,
  PDF_LIMITS,
  type PdfRow,
  type PdfStatement,
  type PdfGroup,
} from '@/lib/pdf-types';
import { preparePdf, reconciliation, type PdfChecks } from '@/lib/pdf-review';
import { parseMoney } from '@/lib/imports';
import { Notice, Pill } from './ui';
import { readableError } from './ExpenseDialog';
const WARNINGS = {
  dates:
    'Dates may be purchase dates or have inferred years. Check the posted date against your statement; edit it if necessary.',
  'unknown-sections':
    'Some rows have no recognized section. Choose their statement section.',
  'missing-totals':
    'Some statement totals are missing. Enter every required total from the original on your device, including confirmed zeros.',
  'layout-unvalidated':
    'This bank layout has only synthetic validation. Check every page and correct or add missing rows.',
  'no-cycle':
    'The statement period was not recognized. Check years and dates yourself.',
  'ambiguous-rows':
    'Some lines could not be interpreted safely. Check all pages and add any missing transactions.',
  'inconsistent-totals':
    'Multiple different totals were found. Verify the total for this statement period, excluding annual totals.',
};
const NO_CHECKS: PdfChecks = { dates: false, sections: false, types: false };
export default function PdfReview({
  statement,
  onPrepared,
}: {
  statement: PdfStatement;
  onPrepared: (result: ReturnType<typeof preparePdf>) => void;
}) {
  const [rows, setRows] = useState(statement.rows),
    [page, setPage] = useState(0),
    [error, setError] = useState('');
  const [checks, setChecks] = useState<PdfChecks>(NO_CHECKS);
  const [expected, setExpected] = useState<Partial<Record<PdfGroup, string>>>(
    () => {
      const result: Partial<Record<PdfGroup, string>> = {};
      for (const group of PDF_GROUPS) {
        const values = [
          ...new Set(
            statement.totals
              .filter((t) => t.group === group)
              .map((t) => t.cents),
          ),
        ];
        if (values.length === 1) result[group] = (values[0] / 100).toFixed(2);
      }
      return result;
    },
  );
  function edit(index: number, patch: Partial<PdfRow>) {
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setChecks(NO_CHECKS);
  }
  const totals = reconciliation(statement, rows, expected),
    matched = totals.filter((t) => t.matches).length,
    uncertainDates = rows.filter((r) => r.dateUncertain).length,
    pages = Math.max(1, Math.ceil(rows.length / 50));
  return (
    <div className="pdf-review">
      <div className="review-head">
        <h3>Review PDF extraction and reconcile</h3>
        <p className="fine-print">
          {statement.pages} {statement.pages === 1 ? 'page' : 'pages'} ·{' '}
          {rows.length} extracted rows ·{' '}
          {statement.cycleFrom ?? 'Start date needs review'} through{' '}
          {statement.cycleThrough ?? 'end date needs review'}. Reconcile the
          entire statement here, including August rows. Tracking begins
          September 1, 2026 at the next step.
        </p>
        <div className="review-stats">
          <Pill tone={matched === totals.length ? 'good' : 'warn'}>
            {matched} of {totals.length} sections reconciled
          </Pill>
          {uncertainDates > 0 && (
            <Pill tone="warn">
              {uncertainDates} {uncertainDates === 1 ? 'date' : 'dates'} to
              check
            </Pill>
          )}
          {statement.warnings.length > 0 && (
            <Pill tone="warn">
              {statement.warnings.length}{' '}
              {statement.warnings.length === 1 ? 'warning' : 'warnings'}
            </Pill>
          )}
        </div>
      </div>
      {statement.warnings.map((w) => (
        <Notice tone="warn" key={w}>
          {WARNINGS[w]}
        </Notice>
      ))}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className="review-table">
        <table className="data-table cards-on-phone editable">
          <thead>
            <tr>
              <th scope="col">Page / posted date</th>
              <th scope="col">Description</th>
              <th scope="col">Amount</th>
              <th scope="col">Statement section / type</th>
              <th scope="col">Exclude pending / remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * 50, (page + 1) * 50).map((r, offset) => {
              const i = page * 50 + offset;
              return (
                <tr
                  key={r.id}
                  className={
                    r.pending
                      ? 'row-muted'
                      : r.dateUncertain
                        ? 'row-review'
                        : ''
                  }
                >
                  <td data-label={`Page ${r.page}`}>
                    <span className="row-num hide-phone">Page {r.page}</span>
                    <input
                      aria-label={`PDF date ${i + 1}`}
                      type="date"
                      value={r.date}
                      onChange={(e) => edit(i, { date: e.target.value })}
                    />
                    {r.dateUncertain && (
                      <span className="cell-warn">
                        <TriangleAlert size={13} aria-hidden />
                        Check date / year
                      </span>
                    )}
                  </td>
                  <td data-label="Description" className="cell-wide">
                    <input
                      aria-label={`PDF description ${i + 1}`}
                      value={r.merchant}
                      maxLength={1000}
                      onChange={(e) => edit(i, { merchant: e.target.value })}
                    />
                  </td>
                  <td data-label="Amount">
                    <input
                      aria-label={`PDF amount ${i + 1}`}
                      defaultValue={(r.amountCents / 100).toFixed(2)}
                      inputMode="decimal"
                      onBlur={(e) => {
                        try {
                          const amount = parseMoney(e.target.value);
                          if (amount < 0) throw new Error();
                          edit(i, { amountCents: amount });
                          setError('');
                        } catch {
                          setError(
                            'Enter a nonnegative amount with at most two decimal places.',
                          );
                          e.target.value = (r.amountCents / 100).toFixed(2);
                        }
                      }}
                    />
                  </td>
                  <td data-label="Section / type">
                    <span className="cell-stack">
                      <select
                        aria-label={`PDF section ${i + 1}`}
                        value={r.group}
                        onChange={(e) =>
                          edit(i, { group: e.target.value as PdfGroup })
                        }
                      >
                        {PDF_GROUPS.map((g) => (
                          <option key={g} value={g}>
                            {GROUP_LABELS[g]}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`PDF type ${i + 1}`}
                        value={r.type}
                        onChange={(e) =>
                          edit(i, { type: e.target.value as PdfRow['type'] })
                        }
                      >
                        {TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </span>
                  </td>
                  <td data-label="Options">
                    <span className="cell-row">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={r.pending}
                          onChange={(e) =>
                            edit(i, { pending: e.target.checked })
                          }
                        />
                        Pending
                      </label>
                      <button
                        type="button"
                        className="secondary small-button"
                        onClick={() => {
                          setRows(rows.filter((_, n) => n !== i));
                          setChecks(NO_CHECKS);
                          setPage(0);
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                        Remove row
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <button
          type="button"
          className="secondary"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous PDF rows
        </button>
        <span>
          Page {page + 1} of {pages}
        </span>
        <button
          type="button"
          className="secondary"
          disabled={(page + 1) * 50 >= rows.length}
          onClick={() => setPage(page + 1)}
        >
          Next PDF rows
        </button>
        <button
          type="button"
          className="secondary"
          disabled={rows.length >= PDF_LIMITS.rows}
          onClick={() => {
            setRows([
              ...rows,
              {
                id: crypto.randomUUID(),
                page: 1,
                date: '',
                merchant: '',
                amountCents: 0,
                group: 'unknown',
                type: 'purchase',
                dateUncertain: true,
                pending: false,
              },
            ]);
            setPage(Math.floor(rows.length / 50));
            setChecks(NO_CHECKS);
          }}
        >
          <Plus size={15} aria-hidden />
          Add missing row
        </button>
      </div>
      <h3 className="section-label">Statement section totals</h3>
      <p className="fine-print">
        Use the period totals, not balances or year totals. Payment and credit
        amounts are positive magnitudes; a combined total may require splitting
        the section manually if debits and credits offset. Pending rows are
        excluded. Card payments must be transfers.
      </p>
      <div className="totals-grid">
        {totals.map((t) => (
          <label key={t.group} className={t.matches ? 'total ok' : 'total off'}>
            {GROUP_LABELS[t.group]}
            <span className="input-prefix">
              <span aria-hidden>$</span>
              <input
                aria-label={`Statement total ${t.group}`}
                inputMode="decimal"
                value={expected[t.group] ?? ''}
                placeholder="Enter total, or confirmed 0"
                onChange={(e) => {
                  setExpected({ ...expected, [t.group]: e.target.value });
                  setChecks({ ...checks, sections: false });
                }}
              />
            </span>
            <span className="total-status">
              {t.matches ? (
                <CircleCheck size={14} aria-hidden />
              ) : (
                <TriangleAlert size={14} aria-hidden />
              )}
              Extracted {money(t.actualCents)} ·{' '}
              {t.matches
                ? 'matches'
                : t.expectedCents === undefined
                  ? 'needs reconciliation'
                  : `needs reconciliation (off by ${money(Math.abs(t.expectedCents - t.actualCents))})`}
            </span>
          </label>
        ))}
      </div>
      <fieldset className="checklist">
        <legend>Before you continue</legend>
        {(
          [
            [
              'dates',
              'I verified or corrected every posted date and inferred year.',
            ],
            [
              'sections',
              'I checked all statement pages, added missing rows, and reconciled all sections, including empty sections.',
            ],
            [
              'types',
              'I checked payments as transfers, refunds as credits, and other transaction types.',
            ],
          ] as const
        ).map(([key, label]) => (
          <label className="check" key={key}>
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
      <div className="modal-actions sticky-actions">
        <button
          type="button"
          className="primary"
          disabled={
            !checks.dates ||
            !checks.sections ||
            !checks.types ||
            totals.some((t) => !t.matches)
          }
          onClick={() => {
            try {
              onPrepared(preparePdf(statement, rows, expected, checks));
            } catch (e) {
              setError(readableError(e, 'Review the PDF rows.'));
            }
          }}
        >
          Continue to duplicate and category review
        </button>
      </div>
    </div>
  );
}
