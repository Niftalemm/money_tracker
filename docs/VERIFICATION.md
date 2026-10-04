# Verification record · October 4, 2026

| Check                                                 | Result                   |
| ----------------------------------------------------- | ------------------------ |
| TypeScript                                            | Passed                   |
| Unit/integration tests                                | 56 passed across 8 files |
| Desktop/phone production browser checks               | 30 passed                |
| Next.js production build                              | Passed                   |
| Full dependency audit, including development tools    | 0 known vulnerabilities  |
| Repository private-file/key scan and whitespace check | Passed                   |

Unit/integration checks execute **both shipped migrations** in local PostgreSQL (PGlite), using compatible `auth.uid()`/`auth.jwt()` helpers. They cover anonymous/second-user denial, owner without MFA, MFA loss after an existing save, restricted direct writes, RLS/trigger behavior under accidental write grants, strict nested encrypted payload types, and competing device saves. Browser storage-operation tests recheck user/MFA/owner gates before every read and write. **These are not tests of live Supabase tokens or project configuration.**

Web Crypto tests cover full encrypted records/settings, fresh nonces, non-extractable keys, wrong secrets/recovery keys, modified ciphertext/nonces/key wrappers, and complete backup restoration. Recovering a login password does not unlock the vault. Actual browser backup checks verify with the offline recovery key, explicitly restore fake records, compare totals, invalidate verification when inputs change, and close during asynchronous verification without reviving a plaintext preview. Cloud recovery/restore is still pending.

Production browser checks run on a fresh local Next.js production build in desktop and phone Chromium. They use only synthetic records/PDFs and exercise:

- September dashboard, all banks, categories/merchant drilldowns, monthly comparisons, entry/deletion, CSV mapping/type correction/confirmation/undo, responsive layouts, and memory-only storage.
- The actual isolated PDF.js worker for Amex, Capital One, BofA credit card, and BofA deposit statements; whole-statement totals including August, September cutoff, payment/income types, required review, and missing-row reconciliation blocking.
- Malformed, embedded-script, blank/image-only, and excessive-page PDFs; static error handling; no upload/outbound service request during extraction; merchant markup rendered as text. Unit tests additionally check oversized files, hard worker deadlines, and cancellation.
- Production nonce CSP without unsafe-eval, frame denial, nosniff, no-referrer, no-store, the worker's network-blocking CSP, ten-minute inactivity locking, and locking on the first interaction after an expired background interval.

A separate local reference check used the supplied Amex PDF in the same browser worker, without saving, screenshots, tracing, or cloud upload. It extracted 63 new-charge rows that reconciled to their summary and two payment rows. Other section totals were ambiguous, so **complete statement reconciliation remains unverified**. The absence of a verified posted-date header requires owner date review. Only structural counts, warning codes, and reconciliation booleans were reported; original/extracted financial values are absent from the repository.

**Pending live checks:** no Supabase project or Vercel deployment exists yet. Actual policies/grants/triggers, owner/MFA login and tokens, ciphertext-only cloud storage and requests, deployed headers, owner recovery and backup restoration against the cloud vault, and phone/computer conflict behavior must be verified after setup, using fake data. Real Capital One/BofA PDF layouts and Amex posted-date semantics also remain unvalidated. See [DEPLOYMENT.md](DEPLOYMENT.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), and the step-by-step [README](../README.md).

No production deployment or paid feature was enabled. Passing local checks does not establish that a future deployment is secure.
