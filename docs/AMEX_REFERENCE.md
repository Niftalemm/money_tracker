# Amex reference and extraction boundary

The supplied Amex statement was inspected **locally** as a layout reference. Its original PDF, merchant names, account information, financial amounts, and extracted transaction text have not been committed or imported into the app. The inspection reported structure and reconciliation results only.

Observed structure: eight pages; selectable transaction text; **Payments and Credits → Summary / Detail**, **New Charges → Summary / Detail**, followed by **Fees** and **Interest Charged**. Charge details continue across pages. Merchant lines can have additional location/service text below them. The remittance coupon, balance summary, account identifiers, rewards, and disclosure pages are not transactions. A page without selectable text is not a transaction source and does not justify OCR.

Local extraction of the new-charge detail rows reconciled with the statement's new-charge summary. This establishes the charge section's layout, not a release-ready PDF parser. Payment/credit and fee/interest sections need independent reconciliation, synthetic layout fixtures, and a redacted sample retained outside source control for future validation. No explicit **posted date** header or separate **purchase date** header was found. Treating a transaction detail date as a posted date without establishing its meaning would produce incorrect calendar-month totals.

The supplied billing cycle begins in August and ends before the end of September. Only verified **posted dates from September 1 onward** belong in the tracker. Do not mark all of September covered from that statement. Obtain a September 1–30 transaction export or the adjacent statement covering late September, including refunds and any payments/fees.

## Extraction fields

| Field                  | Rule                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account alias          | `Amex`, never card numbers or account holder identifiers                                                                                          |
| Posted date            | Required from a verified field/date convention; use it for calendar-month totals                                                                  |
| Purchase date          | Preserve separately when provided; does not prove account coverage                                                                                |
| Description / merchant | Main merchant line; retain only useful merchant text, with optional non-sensitive notes                                                           |
| Amount                 | Parse exactly into integer cents; sign/type follows section and verified bank convention                                                          |
| Bank transaction ID    | Preserve a stable export ID when available; statement line position is not a stable ID                                                            |
| Type                   | New charges generally suggest purchase; payments suggest transfer; credits require refund/income/transfer review; fees/interest count as expenses |
| Category               | Merchant rule or explicit review; ambiguity stays Uncategorized                                                                                   |

## Grouping

Use the initial Groceries, Dining, Transit, Housing, Utilities, Subscriptions, Shopping, Health, Other, and Uncategorized categories. Merchant rules assign only categories, not transaction types. For example, a verified supermarket merchant can map to Groceries, a restaurant to Dining, and a rail operator to Transit. Fees/interest can start in Other. Let the owner correct any category. Merchant text alone cannot establish a refund or transfer. Do not infer grocery items from a merchant total.

Category → merchant → exact purchase/credit is the dashboard drilldown. Each level uses posted-month net spending: purchases and fees less refunds and confirmed reimbursements. Card payments remain visible with an excluded label. A purchase on Amex and its payment from Bank of America count once.

## Current import choice

Use Amex **CSV or XLSX**, explicitly map columns/signs, review, and confirm. The app currently rejects PDFs for all banks with a clear explanation. Direct support for this text PDF layout is a follow-up only after date semantics, **every section's** totals, redaction, and repeat/overlap behavior are validated. Scanned PDFs and macro workbooks remain unsupported. Bank of America and Capital One layouts still need samples.
