# Money Tracker

A lightweight, private expense tracker: **Dashboard, Transactions, Cash flow, Accounts, Recurring, Settings**. One Next.js/TypeScript application, Supabase Auth/Postgres, and Vercel. USD, New York time, tracking from **September 1, 2026**. No bank connections, financial AI, or notification infrastructure.

## Try fake data first

```sh
npm ci
npm run dev
```

Open http://localhost:3000 and choose **Try with fake data**. No credentials or services are needed. The demo has September and October 2026 entries across **Amex, Bank of America, and Capital One**, repeated purchases, a refund, a card payment, a shared reimbursement, bill links, and coverage. Changes remain in memory and disappear when you leave or lock. Demo records never enter a cloud vault. Run `npm run fake:pdf` to generate four synthetic statement PDFs in the Git-ignored `private-data/fake-statements/` directory (all three credit cards plus a BofA deposit account). Upload these in the demo and check section totals before confirming. Browser tests also generate PDFs in memory. For optional CSV practice, use the three explicitly synthetic CSVs in `tests/fixtures/` (these are normalized examples, not validated bank export layouts). Amex and Capital One use positive-purchase amounts; Bank of America uses separate debit/credit columns. In review, change the synthetic card payment to transfer and synthetic salary to income before confirming.

The dashboard opens in September. Use the month switcher (‹ ›) to select October for equal-day comparisons, a running spending chart against September, and a clearly labeled early estimate. Select a category, then a merchant, for exact transactions.

- **Transactions** groups entries by day, with search, category/type filters, and one-tap bank chips. Select any row to edit or delete it.
- **Cash flow** opens with a flow diagram: recorded income on the left flows through the month into each spending category and, when income exceeds spending, "Left over". Tap a flow for its amount or a category for its transactions. Below it, recorded income vs. net spending by month, with full category and top-merchant breakdowns.
- **Accounts** shows each bank's spending, confirmed coverage, statement-availability day, update notices, and confirmed ranges.
- **Recurring** lists scheduled bills as _not yet recorded_ or _payment linked_ for the selected month.
- **Settings** contains categories, merchant rules, import history/undo, and encrypted backups.

On a computer, every section is in the top navigation bar, with Settings and Lock at the right. On a phone, a bottom tab bar holds Dashboard, Transactions, a central **Add** button, Cash flow, and **More** (Accounts, Recurring, Settings); the lock button stays in the top bar. A new, empty vault shows a short getting-started checklist. Text uses Inter, with Source Serif 4 for page titles and money figures (both SIL Open Font License, installed through npm and served from the app itself). Account badges use the official Amex and Bank of America marks from Simple Icons (CC0) and the official Capital One logo from thesvg.org (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Merchants show a brand logo when the description matches a well-known brand (for example Starbucks, McDonald's, Uber Eats, Target, Netflix), otherwise an icon for the kind of place (coffee, bakery, pizza, groceries, delivery, restaurant, transit, pharmacy, and more). Recognition runs on your device; nothing is fetched from other sites. Logos are trademarks of their owners.

**Dark mode** follows your device by default. Switch it with the sun/moon button in the top bar or under **Settings → Appearance** (System, Light, Dark). The choice is saved inside your encrypted vault, never in browser storage, so it follows you between phone and computer.

## Supabase setup — about 10 minutes

1. In your own Supabase account, create one project. Keep the database password in your password manager. Choose the Free plan initially.
2. In **SQL Editor**, run [migration 1](supabase/migrations/202610040001_encrypted_vault.sql), then [migration 2](supabase/migrations/202610040002_security_hardening.sql), each once and in that order. They create one encrypted vault per owner, a single-owner allowlist, MFA-aware read/write policies, strict encrypted-envelope validation, a guard trigger, and an atomic version-checked save function. Existing installations also need migration 2. Do not disable these policies.
3. Under **Authentication → Providers → Email**, disable **Allow new users to sign up**. Enable email/password login. There is no signup UI. Do not enable other providers.
4. In **Authentication → Users**, add your one owner account, set a strong login password, and mark/confirm its email as appropriate for a manually created account. Copy that user's UUID. Add it to the single-owner allowlist in SQL Editor:

   ```sql
   insert into private.owner (user_id)
   values ('REPLACE_WITH_YOUR_OWNER_USER_UUID');
   ```

   Only one owner is permitted. An additional authenticated user cannot read or write a vault, even with MFA. Never put a service-role key into the browser or environment variables for this app.

5. Enable **TOTP MFA** in Supabase Auth. The app enrolls an authenticator on the owner's first login and requires a verified code before accessing records. Keep authentication recovery separate from encryption recovery. Manage lost MFA through Supabase's owner administration; recovering login does not decrypt the vault.
6. In project **Connect / API Keys**, copy the project URL and **publishable key**. Copy `.env.example` to `.env.local` and fill only these two values:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
   ```

   These are intentionally public client configuration. The database enforces ownership and MFA. The owner UUID is stored in the database, not a client authorization setting. **No unlock secret, recovery key, bank password, or service-role key belongs in an environment variable.**

7. Restart the app. Sign in, scan the authenticator QR, and verify its code. Choose a separate, unique **unlock secret of at least 14 characters**. Download the offline recovery key to a safe place outside the app. The app tests recovery before creating the empty cloud vault.
8. Complete the fake-data security/recovery checklist in [DEPLOYMENT.md](docs/DEPLOYMENT.md) before adding real records.

The Supabase SQL Editor and dashboard are administrator tools and can see your allowlist and encrypted payloads. App users access the Data API using their session token. RLS and the checked save function enforce the same single-owner/MFA boundary on every operation.

## Vercel setup

1. Import **Niftalemm/money_tracker** into your own Vercel account. Use the reviewed implementation branch or merge its pull request first.
2. Select the **Next.js** framework, repository root directory, and Node **24.x** (22.x also works). Install: `npm ci`; build: `npm run build`. Leave output directory automatic.
3. Add the two variables above to the Production environment. For previews, use a separate Supabase project with fake data; otherwise leave preview variables unset so previews remain demo-only.
4. Deploy. In **Supabase Authentication → URL Configuration**, set **Site URL** to the HTTPS Vercel production URL. Add only your exact production URL and localhost development URL to redirect URLs if you use dashboard-issued password reset/invitation links. Login here is email/password plus TOTP, with no OAuth redirect flow or in-app reset screen.
5. Enable MFA on Supabase, Vercel, and GitHub administrative accounts. Restrict repository/deployment write access. Review dependency changes before shipping code that can access an unlocked vault.
6. Run the release checklist from the production URL. Do not enable paid features automatically.

The app needs no Vercel Cron, server functions for financial data, SMTP integration, blob storage, analytics, or external bank APIs. Financial files and records are processed in the browser; Vercel serves the application and Supabase stores ciphertext. The server-rendered app never receives an unlocked transaction list.

## Imports and September coverage

**PDF is the primary import option for Amex, Capital One, and Bank of America.** Choose the account, then its statement PDF. PDF.js 6 (its legacy build, which adds fallbacks so recent phone and desktop browsers that lack the newest JavaScript built-ins still work) performs text extraction in an isolated browser worker on your device. The original PDF is never uploaded, rendered as HTML, or sent to AI. Embedded scripting is rejected; no PDF viewer, scripting manager, links, external resources, or OCR run. The worker has a separate network-blocking CSP and is terminated on timeout, cancellation, close, or lock.

Limits: **10 MB, 40 pages, 20 seconds, 2 million text characters, 100,000 text items, 25,000 lines, and 2,500 transaction rows**. Malformed, password-protected, and image-only statements are rejected. Use a smaller plain-text statement, manual entry, or a bank export when needed.

Before saving, review extracted posted dates, inferred years, descriptions, amounts, sections, and types. Correct or add missing rows. Enter and reconcile every required statement-period section total, including confirmed zeros for empty sections. This review includes pre-September rows so the whole file balances; the next step excludes those rows from tracking. Missing sections, ambiguous lines, uncertain dates, and conflicting totals remain visible. Confirm all pages and date/type semantics, then review duplicates and categories. A mismatch blocks continuation. No filename, original file, account number, or raw page text is stored; the encrypted batch retains only the reconciliation evidence.

The supplied Amex reference informed its profile. **Real Capital One and Bank of America layouts remain unvalidated**; synthetic credit-card and Bank of America deposit examples are tested. Unknown layouts require full manual checking, correction, and reconciliation. An unfamiliar layout can yield few/no rows; add missing rows or use a CSV export. PDF rows have no fabricated bank transaction IDs, so overlapping statements require explicit duplicate review.

**CSV or XLSX is optional:** one sheet, one header row, at most 10 MB, 50,000 rows, and 60 columns. Explicitly map posted date, merchant/description, and amount or debit/credit; confirm the sign convention. Optional mappings include bank transaction ID, pending status, and purchase date. Dates use YYYY-MM-DD or MM/DD/YYYY. Formula cells, macro workbooks, external workbook links, and malformed files are rejected.

Review rows and correct types/categories before confirming. Negative/credit amounts initially suggest refunds; verify income and transfers. Text suggesting a payment never automatically determines its type. Pending rows are excluded when mapped. Invalid rows explain the problem. Unknown merchants stay Uncategorized and still count.

Stable bank IDs link existing entries and keep category edits. Without IDs, potential overlaps match account, posted date, normalized description, and amount, with occurrence counts to preserve repeated identical purchases. Every uncertain match requires a choice: separate purchase, same transaction, or skip. Manual matches always require review. Undo removes only records unique to the chosen batch and its coverage; earlier/shared/manual records survive.

A statement labeled September does **not** prove September 1–30 coverage. Collect adjacent statements or a posted-date export covering all September days. Confirm date ranges per account only after verifying completeness, including days without purchases. Optional weekly Amex imports do not advance the other banks' coverage. See [the Amex reference notes](docs/AMEX_REFERENCE.md).

## Counting, estimates, and bills

All calculation uses integer cents. Purchases, bills, fees, and interest count. Refunds reduce spending in their posted month. Card payments, transfers, and income remain visible but excluded. Record a confirmed shared reimbursement on the purchase; link an imported reimbursement of the same amount to prevent subtracting it twice.

Monthly/category/merchant comparisons use equal covered calendar days for incomplete months and flag partial coverage. Zero/negative prior spending has no percentage. Aligned current coverage no more than seven days old enables a daily-rate projection: recorded net spending + unmatched scheduled bills + remaining variable spending. Bills linked to purchases and one-time costs are excluded from the variable rate. Unmatched bills are labeled **No payment recorded** unless you confirm unpaid; planning assumes the scheduled expense will occur. Fewer than seven covered days shows **Early estimate**. Uneven/stale coverage uses the latest complete prior month's variable daily rate plus scheduled bills. Without either valid basis, the estimate is omitted. Estimates never enter actual totals or Excel actuals.

## Encryption, sync, and recovery

Web Crypto generates a random 256-bit data key. AES-256-GCM authenticates records with a fresh 96-bit nonce per encryption. PBKDF2-HMAC-SHA-256 with 600,000 iterations and a random salt derives a separate wrapping key from your unlock secret. A random 256-bit offline recovery key wraps the same data key independently. Context-specific authenticated data separates key wrapping and records.

The whole small data model is encrypted: transactions, categories, merchant rules, coverage, import history, bill links, and preferences. The cloud retains only identity, ciphertext/encryption parameters, a version counter, and a save timestamp. Keys are non-extractable Web Crypto objects kept in memory; no plaintext records, keys, or sessions are persisted in browser storage. Lock/logout/unmount and ten minutes of inactivity discard references. JavaScript cannot guarantee forensic zeroization of all memory copies.

Saves are serialized and use atomic compare-and-swap versions. If another device changes the vault, the app refuses to overwrite it. Lock and unlock to reload before reapplying the unsaved change. There is no offline write queue or automatic merge. An encrypted backup is portable across devices; verify/decrypt it locally, then explicitly confirm replacement. After restoring, **the backup's unlock secret and recovery key apply**.

If you lose your unlock secret, use the offline recovery key to unlock. This version does not rotate an unlock secret; to change it, create a fresh empty vault under administrator supervision and re-enter/import data, or implement and review a key-rewrapping flow first. Losing both secrets can make the records permanently unrecoverable. A compromised device or malicious application code can read unlocked data. Authentication password recovery cannot bypass encryption.

Excel downloads are readable copies, generated locally after unlock, with Transactions and Monthly summary sheets. Imported text remains literal spreadsheet text. Keep these copies private. Encrypted full backups preserve the complete model and import/bill relationships.

## Verification

```sh
npm run check:repo
npm audit --audit-level=low
npm run typecheck
npm test
npm run build
npx playwright install chromium
E2E_PRODUCTION=1 npm run test:e2e
```

Unit/integration tests cover cents, card payment exclusion, refunds/reimbursements, equal-day comparisons, coverage/estimates, imports/overlap/undo/manual matches, encryption/recovery/tampering, and Excel agreement. Access tests execute both actual migrations in local PostgreSQL via PGlite using Supabase-compatible JWT helpers: anonymous, second-user, owner without MFA, owner with MFA, write grants, and version conflicts. Browser tests exercise desktop and phone layouts, every navigation section without horizontal scrolling, 44-pixel phone touch targets, bank filters, import corrections/confirmation/undo, category and merchant drilldowns, manual edits/deletion, readable validation errors, success messages, local Excel export, and the empty-vault checklist with synthetic records. Local production headers and worker behavior are tested. Actual Supabase MFA/policies, Vercel headers, encrypted storage/recovery, and two real devices remain pending until deployment. See [the security review](docs/SECURITY_REVIEW.md) and [verification record](docs/VERIFICATION.md).

## Inputs and release gates

- **Your Supabase project and owner email/user UUID**, and access through your own dashboard. Only public URL/key values go into deployment configuration. No cloud credentials were connected for this build; services cannot be configured in your accounts from this session.
- **Your Vercel project / production URL** and your choice to merge/deploy the implementation. The repository implementation and setup instructions are provided; no live production deployment has been made.
- **Redacted PDF samples from Capital One and Bank of America**, and confirmation of the exact account types (credit card or checking/savings), to validate their real layouts. Optional CSV/XLSX samples can validate export columns/signs. Keep originals and account identifiers out of source control.
- **Confirmation of Amex detail-date semantics** (posted vs. purchase date) during PDF review. September needs the missing late-month posted transactions from an adjacent statement or date-range export.
- **Expected statement availability day for each account**, confirmed from your statement workflow; whether optional weekly Amex notices should be enabled. Production defaults are unset/off.
- **Your private unlock secret and offline recovery-key storage**; choose these inside the app. Never send them in chat.

## Running costs

For one personal owner and a small encrypted vault, **Supabase Free and Vercel Hobby can be $0/month** within their current limits and eligibility terms. Supabase free projects can pause when inactive; limits, backup retention, and Vercel usage terms may change. Verify current plans in your accounts before launch. A custom domain is optional and adds its registrar cost. There are no paid AI, bank connector, SMS, or notification services. Paid Supabase/Vercel upgrades, automated managed backups, and plan-dependent hosting/auth features are optional and require your explicit decision. Encrypted manual backups are included.
