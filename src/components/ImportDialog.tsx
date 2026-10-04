'use client';
import { useState } from 'react';
import { Upload } from 'lucide-react';
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
export default function ImportDialog({
  state,
  busy,
  save,
  onClose,
}: {
  state: TrackerState;
  busy: boolean;
  save: (next: TrackerState) => Promise<void>;
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
  return (
    <Modal title="Upload transactions" wide onClose={onClose}>
      <p className="muted">
        Files are processed on this device. Nothing is saved until you confirm.
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!rows ? (
        <>
          <label>
            Account
            <select
              value={account}
              disabled={Boolean(sheet)}
              onChange={(e) => setAccount(e.target.value as Account)}
            >
              {ACCOUNTS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="file-drop">
            <Upload size={24} />
            <span>
              {loading
                ? 'Reading locally…'
                : 'Choose CSV or XLSX · up to 10 MB'}
            </span>
            <input
              aria-label="Transaction file"
              type="file"
              accept=".csv,.xlsx"
              disabled={loading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLoading(true);
                setError('');
                try {
                  setSheet(await readImport(file));
                  setSignsConfirmed(false);
                } catch (err) {
                  setSheet(null);
                  setError(
                    err instanceof Error
                      ? err.message
                      : 'File could not be read.',
                  );
                } finally {
                  setLoading(false);
                }
              }}
            />
          </label>
          <p className="small muted">
            Bank export layouts need redacted sample validation. Map every file
            explicitly. Macro workbooks and PDFs are rejected.
          </p>
          {sheet && (
            <>
              <h3>Map your export columns</h3>
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
                  className="primary"
                  disabled={!signsConfirmed}
                  onClick={() => {
                    try {
                      setRows(previewImport(sheet, map, account, state));
                      setError('');
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Check mapping.',
                      );
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
          <div className="preview-summary">
            <span>{valid.length} valid rows</span>
            <span>
              {rows.filter((r) => !r.transaction).length} rejected / pending
            </span>
            <span>
              {valid.filter((r) => r.matchId).length} possible duplicates
            </span>
            <span>{uncertain} need review</span>
          </div>
          <p className="small muted">
            {TYPES.map(
              (type) =>
                `${valid.filter((r) => r.transaction?.type === type).length} ${type}`,
            ).join(' · ')}
            . Credits start as refunds: verify their type. Possible payments are
            suggestions only.
          </p>
          <div className="table-wrap import-preview">
            <table>
              <thead>
                <tr>
                  <th>Row / date</th>
                  <th>Description / notes</th>
                  <th>Amount</th>
                  <th>Type / category</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .slice(reviewPage * 50, (reviewPage + 1) * 50)
                  .map((r, offset) => {
                    const i = reviewPage * 50 + offset;
                    return (
                      <tr key={i}>
                        <td>
                          {r.row}
                          <span className="small muted block">
                            {r.transaction?.postedDate}
                          </span>
                        </td>
                        <td>
                          {r.transaction?.merchant ?? r.error}
                          {r.suggestion && (
                            <p className="small warning">{r.suggestion}</p>
                          )}
                          {r.matchId && (
                            <p className="small warning">
                              {r.matchKind === 'stable'
                                ? 'Same bank ID: keeps your edits.'
                                : r.matchKind === 'manual'
                                  ? 'Possible match to manual entry. Confirm explicitly.'
                                  : 'Possible overlapping purchase. Repeated purchases are preserved unless you link or skip.'}
                            </p>
                          )}
                        </td>
                        <td>
                          {r.transaction && money(r.transaction.amountCents)}
                        </td>
                        <td>
                          {r.transaction && (
                            <>
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
                            </>
                          )}
                        </td>
                        <td>
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
                            <span className="tag">
                              {r.pending ? 'Pending' : 'Rejected'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <div className="modal-actions">
              <button
                className="secondary"
                disabled={reviewPage === 0}
                onClick={() => setReviewPage(reviewPage - 1)}
              >
                Previous
              </button>
              <span>Page {reviewPage + 1}</span>
              <button
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
            <p className="small muted">
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
          <div className="modal-actions">
            <button className="secondary" onClick={() => setRows(null)}>
              Back to mapping
            </button>
            <button
              className="primary"
              disabled={busy || uncertain > 0}
              onClick={async () => {
                try {
                  await save(
                    confirmImport(
                      state,
                      rows,
                      account,
                      coverageConfirmed ? { from, through } : undefined,
                    ),
                  );
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Import failed.');
                }
              }}
            >
              {busy ? 'Saving…' : 'Confirm import'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
