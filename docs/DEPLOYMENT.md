# Deployment and fake-data release checklist

The repository tests use synthetic data. They do not establish that a live Supabase project, real bank exports, or a production deployment has been configured correctly. Complete this checklist in your own accounts before using real statements.

## Accounts and configuration

- [ ] Apply both migrations in order, disable public signup, create one confirmed owner, insert its UUID into `private.owner`, and enable TOTP MFA.
- [ ] Set Vercel Node to 24.x, framework to Next.js, install command to `npm ci --include=dev`, and build command to `npm run build`. Build tools include esbuild for the local PDF worker; keep development dependencies available during the build.
- [ ] Configure only the public Supabase URL/publishable key in Vercel. Confirm no service-role key, financial files, recovery key, or unlock secret appears in environment variables, git history, logs, or analytics.
- [ ] Use an exact HTTPS production Site URL. Keep previews demo-only or on a separate test project. Enable administrator MFA for GitHub, Vercel, and Supabase.
- [ ] Confirm current free-plan limits and eligibility. Do not activate paid plans/features without the owner's decision.

## Live authorization boundary (use fake records)

1. In the owner session, complete TOTP verification, create a vault, and save a fake expense. Query `public.vaults` in SQL Editor. It must contain an encrypted envelope, version, identity, and save time; no merchant, dates, categories, notes, or transaction arrays.
2. Before verifying MFA, use the owner AAL1 access token with the Data API. Reads must return no rows; `save_vault` must reject with `NOT_AUTHORIZED`.
3. Create a temporary second test identity **through the administrator dashboard**, with no allowlist change. Verify its MFA if desired. Its authenticated GET of `vaults` must return no records and checked save must reject. Remove this temporary identity afterwards.
4. Using only the public publishable key without a user session, Data API reads/writes must be rejected. Direct authenticated INSERT/UPDATE/DELETE must fail, even for the owner; only `save_vault` may write.
5. Do not copy tokens into repository files or chat. Use temporary shell variables locally if testing REST; never disable RLS to make the app work.

## Recovery, backup, and two devices

- [ ] Create a fake owner vault with a unique unlock secret. Save the offline recovery key separately. Lock and reopen; an unlock is required and the records are absent from local/session storage.
- [ ] Test an incorrect secret and wrong recovery key. Both must fail.
- [ ] Export an encrypted backup. Change a fake record. Verify the backup locally, review its record/import/bill counts, and explicitly restore. Confirm all categories, preferences, coverage, batch references, and bill/reimbursement links survive.
- [ ] Lock and reopen using the backup's secret and separately its recovery key. Recovering the Supabase login alone must not unlock records.
- [ ] Open the same fake vault on a phone and computer. Save on one device, then attempt a save from the stale other device. It must report a conflict and preserve the first save. Lock/unlock the stale device, then reapply its change.
- [ ] Leave an unlocked session inactive for ten minutes, including a background tab. It must lock, discard its keys/state/dialogs, and require login/unlock on return.

## Import/accounting workflow

- [ ] Start with synthetic PDFs for Amex, Capital One, and Bank of America. Check date/section warnings, required zero totals, missing-row mismatches, correction, and final duplicate/category preview. Then validate redacted real layouts outside GitHub, especially Capital One/BofA and Amex date semantics. Optional CSV/XLSX exports require explicit column/sign mapping.
- [ ] Import synthetic repeated purchases and overlapping/repeated files. Review uncertain matches and confirm exact counts. Existing category edits survive, manual entries are never silently merged, and undo keeps earlier/shared records.
- [ ] Test purchase + card payment = one purchase, refunds posted in the next month, a shared reimbursement and its imported match, interest/fees, pending rows, invalid dates/amounts, and September boundaries.
- [ ] Confirm September 1–30 coverage per account with adjacent files where needed. A September-titled statement ending earlier must remain partial. Confirm empty weeks explicitly.
- [ ] Compare total, category, and merchant dollar/percentage changes, including zero/negative prior values and equal-day partial-month comparisons.
- [ ] Link a bill, flag a changed payment amount, and confirm a missing payment is labeled **No payment recorded** until explicitly marked unpaid. Test short-month due-day clamping.
- [ ] Confirm current estimates exclude linked bills and one-time costs from the daily rate; early, historical, stale, uneven, and unavailable estimates are labeled correctly and kept out of actual totals.
- [ ] Confirm Excel selected/all-month totals match the dashboard, and formula-like merchant text remains a literal string cell.
- [ ] Set expected statement availability days. Uploading old coverage must not clear a due notice. Optional Amex notices must not alter the other banks' coverage.

## Production browser check

- [ ] Test phone and desktop navigation, accessible chart tables, category drilldowns, quick entry, import review, corrections, deletion confirmation, and undo.
- [ ] Inspect response headers: nonce-based CSP, frame denial, nosniff, no-referrer, HTTPS HSTS, and no-store. The PDF worker response must additionally contain `connect-src 'none'` and `worker-src 'none'`. No third-party scripts or financial analytics should be present. Development alone may permit unsafe-eval; production must not.
- [ ] Inspect browser network requests during import and edits. Original files, plaintext records, unlock secrets, and keys must never leave the browser. Auth requests contain only login/MFA material; save requests contain only ciphertext.
- [ ] Review the tested implementation and merge/deploy it. Take an encrypted backup before later application/database changes.

Suggested monthly reminder (not created by this security work): first of each month at **7 PM America/New_York**, starting **November 1, 2026**. It requests the three available bank exports and asks for later files when issued; it cannot detect uploads. No app scheduler is needed.
