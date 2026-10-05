# Verification record · October 5, 2026

The local application checks below passed on October 4. The Node 24/build-configuration follow-up also passed a clean install, TypeScript, all 56 unit/integration tests, production build, dependency audit, and repository checks locally on October 5.

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

## Live checks · October 5, 2026

The owner configured Supabase and deployed [the Vercel app](https://money-tracker-rho-lime.vercel.app/). A deployment initially failed because the project URL included `/rest/v1`; removing that path allowed the configured build to become publicly available.

| Check                           | Result                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Public page over verified HTTPS | HTTP 200; cloud configuration present                                                  |
| Page CSP                        | Nonce-based scripts, no unsafe-eval, restricted connection origin, frame/object denial |
| Page headers                    | HSTS, nosniff, no-referrer, DENY framing present                                       |
| PDF worker                      | HTTP 200; CSP blocks network connections and nested workers; nosniff present           |
| Anonymous vault SELECT          | HTTP 401, PostgreSQL permission code 42501                                             |
| Anonymous `owner_access`        | HTTP 401, PostgreSQL permission code 42501                                             |
| Anonymous `save_vault`          | HTTP 401, PostgreSQL permission code 42501                                             |

The API checks used only the public browser key, without a user session. The save probe supplied a null payload and was denied; it created no records. These checks did not inspect financial data. They establish anonymous permission denial on the deployed project, but do not validate authenticated ownership or MFA policies. The live browser check remained unverified because Chromium did not trust the execution environment's proxy certificate; HTTPS verification was kept enabled for the HTTP checks.

**Pending live checks:** actual policies/grants/triggers, owner and second-user access, missing/lost MFA and token behavior, ciphertext-only cloud storage and requests, owner recovery and backup restoration against the cloud vault, and phone/computer conflict behavior require authenticated verification using fake data. Real Capital One/BofA PDF layouts and Amex posted-date semantics also remain unvalidated. See [DEPLOYMENT.md](DEPLOYMENT.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), and the step-by-step [README](../README.md).

No paid feature was enabled during verification. Passing these checks does not establish that the deployment is secure.
