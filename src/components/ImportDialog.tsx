'use client';
import { useEffect, useRef, useState } from 'react';
import PdfReview from './PdfReview';
import { parsePdf } from '@/lib/pdf-client';
import type { PdfStatement } from '@/lib/pdf-types';
import type { PdfProof } from '@/lib/pdf-review';
import {
  ArrowLeft,
  Cpu,
  FileUp,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import Modal from './Modal';
import { ACCOUNTS, TYPES, type Account, type TrackerState } from '@/lib/model';
import {
  confirmImport,
  previewImport,
  readImport,
  type Mapping,
  type PreviewRow,
  type Sheet,
} from '@/lib/imports';
import { money } from '@/lib/accounting';
import { AccountBadge, Notice, Pill, Spinner } from './ui';
import { readableError } from './ExpenseDialog';
const STEPS = ['Choose file', 'Review & reconcile', 'Duplicates & categories'];
export default function ImportDialog({
  state,
  busy,
  save,
  onSaved,
  onClose,
}: {
  state: TrackerState;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
  onSaved?: (message: string) => void;
  onClose: () => void;
}) {
  const [account, setAccount] = useState<Account>('Amex'),
    [sheet, setSheet] = useState<Sheet | null>(null),
    [rows, setRows] = useState<PreviewRow[] | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [signsConfirmed, setSignsConfirmed] = useState(false),
    [coverageConfirmed, setCoverageConfirmed] = useState(false),
    [from, setFrom] = useState('2026-09-01'),
    [through, setThrough] = useState('2026-09-30');
  const [map, setMap] = useState<Mapping>({
    date: '',
    merchant: '',
    amount: '',
    debit: '',
    credit: '',
    id: '',
    status: '',
    purchaseDate: '',
    dateFormat: 'iso',
    signs: 'positive-purchase',
  });
  const [reviewPage, setReviewPage] = useState(0);
  const [pdf, setPdf] = useState<PdfStatement | null>(null),
    [proof, setProof] = useState<PdfProof | undefined>();
  const controller = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  function reset() {
    controller.current?.abort();
    setLoading(false);
    setSheet(null);
    setPdf(null);
    setProof(undefined);
    setRows(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }
  function mappingField(
    key:
      | 'date'
      | 'merchant'
      | 'amount'
      | 'debit'
      | 'credit'
      | 'id'
      | 'status'
      | 'purchaseDate',
    name: string,
  ) {
    return (
      <label key={key}>
        {name}
        <select
          aria-label={name}
          value={map[key]}
          onChange={(e) => setMap({ ...map, [key]: e.target.value })}
        >
          <option value="">
            Select column
            {['id', 'status', 'purchaseDate'].includes(key)
              ? ' (optional)'
              : ''}
          </option>
          {sheet?.headers.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </label>
    );
  }
  function editRow(index: number, changes: Partial<PreviewRow>) {
    setRows(rows!.map((r, i) => (i === index ? { ...r, ...changes } : r)));
  }
  const valid = rows?.filter((r) => r.transaction) ?? [],
    uncertain = rows?.filter((r) => r.decision === 'review').length ?? 0;
  const step = rows ? 2 : sheet || pdf ? 1 : 0;
  return (
    <Modal
      title="Upload transactions"
      wide
      onClose={onClose}
      description="Files are processed on this device. Nothing is saved until you confirm."
    >
      <ol className="stepper" aria-label="Import progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? 'current' : i < step ? 'done' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="step-dot">{i + 1}</span>
            <span className="step-label">
              {i === 1 && sheet && !pdf ? 'Map columns' : label}
            </span>
          </li>
        ))}
      </ol>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      {!rows ? (
        <>
          {step === 0 ? (
            <>
              <label className="account-select">
                Account
                <select
                  aria-label="Account"
                  value={account}
                  disabled={loading}
                  onChange={(e) => setAccount(e.target.value as Account)}
                >
                  {ACCOUNTS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
              <div className={loading ? 'file-drop loading' : 'file-drop'}>
                {loading ? (
                  <>
                    <Spinner />
                    <p className="file-drop-title">
                      Reading your {account} statement on this device…
                    </p>
                    <p className="file-drop-hint">
                      Text extraction runs in an isolated worker with no network
                      access. It stops after 20 seconds.
                    </p>
                    <button type="button" className="secondary" onClick={reset}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="file-drop-icon" aria-hidden>
                      <FileUp size={24} />
                    </span>
                    <p className="file-drop-title">
                      Choose a statement PDF, CSV, or XLSX
                    </p>
                    <p className="file-drop-hint">
                      Drop a file here or tap to browse · up to 10 MB
                    </p>
                  </>
                )}
                <input
                  ref={fileInput}
                  aria-label="Transaction file"
                  type="file"
                  accept=".pdf,.csv,.xlsx"
                  disabled={loading}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    controller.current?.abort();
                    const active = new AbortController();
                    controller.current = active;
                    setLoading(true);
                    setError('');
                    setSheet(null);
                    setPdf(null);
                    setProof(undefined);
                    try {
                      if (/\.pdf$/i.test(file.name)) {
                        const extracted = await parsePdf(
                          file,
                          account,
                          active.signal,
                        );
                        if (!active.signal.aborted) setPdf(extracted);
                      } else {
                        const imported = await readImport(file);
                        if (!active.signal.aborted) setSheet(imported);
                      }
                      if (!active.signal.aborted) setSignsConfirmed(false);
                    } catch (err) {
                      if (!active.signal.aborted)
                        setError(
                          err instanceof Error
                            ? err.message
                            : 'File could not be read.',
                        );
                    } finally {
                      if (!active.signal.aborted) setLoading(false);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
              <ul className="assurance-list">
                <li>
                  <Cpu size={16} aria-hidden />
                  PDFs from Amex, Capital One, and Bank of America are read
                  locally and never uploaded.
                </li>
                <li>
                  <ShieldCheck size={16} aria-hidden />
                  Scanned, scripted, password-protected, and oversized PDFs are
                  rejected.
                </li>
                <li>
                  <TriangleAlert size={16} aria-hidden />
                  Verify every extraction against your statement. CSV and plain
                  XLSX remain optional.
                </li>
              </ul>
            </>
          ) : (
            <div className="import-source">
              <AccountBadge account={account} />
              <span>
                <strong>{account}</strong>
                <span>
                  {pdf
                    ? `Statement PDF · ${pdf.pages} ${pdf.pages === 1 ? 'page' : 'pages'}`
                    : `Spreadsheet · ${sheet?.rows.length ?? 0} rows`}
                </span>
              </span>
              <button type="button" className="text-button" onClick={reset}>
                Choose a different file
              </button>
            </div>
          )}
          {pdf && (
            <PdfReview
              statement={pdf}
              onPrepared={({
                sheet: prepared,
                map: mapping,
                proof: evidence,
              }) => {
                setSheet(prepared);
                setMap(mapping);
                setProof(evidence);
                setRows(previewImport(prepared, mapping, account, state));
                setReviewPage(0);
                setError('');
              }}
            />
          )}
          {sheet && !pdf && (
            <>
              <h3 className="section-label">Map your export columns</h3>
              <div className="form-grid">
                {mappingField('date', 'Posted date')}
                {mappingField('merchant', 'Description / merchant')}
                <label>
                  Date format
                  <select
                    value={map.dateFormat}
                    onChange={(e) =>
                      setMap({
                        ...map,
                        dateFormat: e.target.value as Mapping['dateFormat'],
                      })
                    }
                  >
                    <option value="iso">YYYY-MM-DD</option>
                    <option value="mdy">MM/DD/YYYY</option>
                  </select>
                </label>
                <label>
                  Amount convention
                  <select
                    value={map.signs}
                    onChange={(e) => {
                      setMap({
                        ...map,
                        signs: e.target.value as Mapping['signs'],
                      });
                      setSignsConfirmed(false);
                    }}
                  >
                    <option value="positive-purchase">
                      Positive = purchase; negative = credit
                    </option>
                    <option value="negative-purchase">
                      Negative = purchase; positive = credit
                    </option>
                    <option value="debit-credit">
                      Separate debit and credit columns
                    </option>
                  </select>
                </label>
                {map.signs === 'debit-credit' ? (
                  <>
                    {mappingField('debit', 'Debit / money out')}
                    {mappingField('credit', 'Credit / money in')}
                  </>
                ) : (
                  mappingField('amount', 'Amount')
                )}
                {mappingField('id', 'Bank transaction ID')}
                {mappingField('status', 'Pending / posted status')}
                {mappingField('purchaseDate', 'Purchase date')}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={signsConfirmed}
                  onChange={(e) => setSignsConfirmed(e.target.checked)}
                />
                I checked my export and confirm the amount convention.
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={!signsConfirmed}
                  onClick={() => {
                    try {
                      setRows(previewImport(sheet, map, account, state));
                      setError('');
                    } catch (e) {
                      setError(readableError(e, 'Check mapping.'));
                    }
                  }}
                >
                  Review {sheet.rows.length} rows
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {proof && (
            <Notice tone="success">
              PDF statement totals reconciled. Review categories and duplicates
              before saving.
            </Notice>
          )}
          <div className="preview-summary">
            <span>
              <strong>{valid.length}</strong> valid
            </span>
            <span>
              <strong>{rows.filter((r) => !r.transaction).length}</strong>{' '}
              rejected / pending
            </span>
            <span>
              <strong>{valid.filter((r) => r.matchId).length}</strong> possible
              duplicates
            </span>
            <span className={uncertain ? 'needs' : ''}>
              <strong>{uncertain}</strong> need review
            </span>
          </div>
          <p className="fine-print">
            {TYPES.map(
              (type) =>
                `${valid.filter((r) => r.transaction?.type === type).length} ${type}`,
            ).join(' · ')}
            . Credits start as refunds: verify their type. Possible payments are
            suggestions only.
          </p>
          <div className="review-table">
            <table className="data-table cards-on-phone">
              <thead>
                <tr>
                  <th scope="col">Row / date</th>
                  <th scope="col">Description / notes</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Type / category</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(reviewPage * 50, (reviewPage + 1) * 50)
                  .map((r, offset) => {
                    const i = reviewPage * 50 + offset;
                    return (
                      <tr
                        key={i}
                        className={
                          r.decision === 'review'
                            ? 'row-review'
                            : !r.transaction
                              ? 'row-muted'
                              : ''
                        }
                      >
                        <td data-label="Row">
                          <span className="row-num">Row {r.row}</span>
                          <span className="cell-sub">
                            {r.transaction?.postedDate}
                          </span>
                        </td>
                        <td data-label="Description" className="cell-wide">
                          <span className="cell-strong">
                            {r.transaction?.merchant ?? r.error}
                          </span>
                          {r.suggestion && (
                            <span className="cell-warn">{r.suggestion}</span>
                          )}
                          {r.matchId && (
                            <span className="cell-warn">
                              {r.matchKind === 'stable'
                                ? 'Same bank ID: keeps your edits.'
                                : r.matchKind === 'manual'
                                  ? 'Possible match to manual entry. Confirm explicitly.'
                                  : 'Possible overlapping purchase. Repeated purchases are preserved unless you link or skip.'}
                            </span>
                          )}
                        </td>
                        <td data-label="Amount" className="num">
                          {r.transaction && money(r.transaction.amountCents)}
                        </td>
                        <td data-label="Type / category">
                          {r.transaction && (
                            <span className="cell-stack">
                              <select
                                aria-label={`Type row ${r.row}`}
                                disabled={r.matchKind === 'stable'}
                                value={r.transaction.type}
                                onChange={(e) =>
                                  editRow(i, {
                                    transaction: {
                                      ...r.transaction!,
                                      type: e.target
                                        .value as (typeof TYPES)[number],
                                    },
                                  })
                                }
                              >
                                {TYPES.map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                              <select
                                aria-label={`Category row ${r.row}`}
                                disabled={r.matchKind === 'stable'}
                                value={r.transaction.category}
                                onChange={(e) =>
                                  editRow(i, {
                                    transaction: {
                                      ...r.transaction!,
                                      category: e.target.value,
                                    },
                                  })
                                }
                              >
                                {state.categories.map((c) => (
                                  <option key={c}>{c}</option>
                                ))}
                              </select>
                            </span>
                          )}
                        </td>
                        <td data-label="Action">
                          {r.transaction ? (
                            <select
                              aria-label={`Action row ${r.row}`}
                              value={r.decision}
                              onChange={(e) =>
                                editRow(i, {
                                  decision: e.target
                                    .value as PreviewRow['decision'],
                                })
                              }
                            >
                              {r.matchId && (
                                <option value="review">Review required</option>
                              )}
                              {r.matchKind !== 'stable' && (
                                <option value="include">
                                  Add as separate purchase
                                </option>
                              )}
                              {r.matchId && (
                                <option value="link">
                                  Same transaction · keep existing
                                </option>
                              )}
                              <option value="skip">Skip this row</option>
                            </select>
                          ) : (
                            <Pill tone="neutral">
                              {r.pending ? 'Pending' : 'Rejected'}
                            </Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <div className="pager">
              <button
                type="button"
                className="secondary"
                disabled={reviewPage === 0}
                onClick={() => setReviewPage(reviewPage - 1)}
              >
                Previous
              </button>
              <span>
                Page {reviewPage + 1} of {Math.ceil(rows.length / 50)}
              </span>
              <button
                type="button"
                className="secondary"
                disabled={(reviewPage + 1) * 50 >= rows.length}
                onClick={() => setReviewPage(reviewPage + 1)}
              >
                Next
              </button>
            </div>
          )}
          <div className="coverage-confirm">
            <h3>Confirm coverage only if your export is complete</h3>
            <p className="fine-print">
              A statement title or last purchase date does not prove coverage.
              September needs posted transactions for September 1–30, often from
              adjacent statements. Confirm weeks with no purchases too.
            </p>
            <div className="form-grid">
              <label>
                Covered from
                <input
                  type="date"
                  min="2026-09-01"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                Covered through
                <input
                  type="date"
                  min={from}
                  value={through}
                  onChange={(e) => setThrough(e.target.value)}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={coverageConfirmed}
                onChange={(e) => setCoverageConfirmed(e.target.checked)}
              />
              I verified all posted transactions for this account and range.
            </label>
          </div>
          {uncertain > 0 && (
            <p className="blocking-hint">
              <TriangleAlert size={15} aria-hidden />
              Choose an action for {uncertain} possible{' '}
              {uncertain === 1 ? 'duplicate' : 'duplicates'} to continue.
            </p>
          )}
          <div className="modal-actions sticky-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setRows(null)}
            >
              <ArrowLeft size={16} aria-hidden />
              Back to file review
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || uncertain > 0}
              onClick={async () => {
                try {
                  const next = confirmImport(
                    state,
                    rows,
                    account,
                    coverageConfirmed ? { from, through } : undefined,
                    proof,
                  );
                  await save(next);
                  const batch = next.batches.at(-1);
                  onSaved?.(
                    `${account} import saved · ${batch?.added ?? 0} added${batch?.duplicates ? `, ${batch.duplicates} linked` : ''}`,
                  );
                  onClose();
                } catch (e) {
                  setError(readableError(e, 'Import failed.'));
                }
              }}
            >
              {busy ? <Spinner /> : <Upload size={16} aria-hidden />}
              {busy ? 'Saving…' : 'Confirm import'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
