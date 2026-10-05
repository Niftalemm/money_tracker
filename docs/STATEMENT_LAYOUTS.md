# Statement layouts and extraction boundary

One real statement per bank (an Amex card, a Capital One card, and a Bank of America checking account) was checked **locally** in the app's own PDF worker. The originals, names, account numbers, merchant text, and amounts are not in this repository; only the structural facts below are recorded. Synthetic tests in `tests/pdf.test.ts` mirror each layout with fake text.

All three files were plain text PDFs with no JavaScript, forms, automatic actions, embedded files, links, or encryption. In the browser import flow, each reconciled every required section and made no network request beyond the local app.

## Amex

- Header: **Closing Date MM/DD/YY**; "Days in Billing Period: N" appears later. The period start is the closing date minus N − 1 days (a second Amex statement, May–June, confirmed this and reconciled every section).
- **Payments and Credits → Summary** (Payments, Credits, Total) then **Detail**; **New Charges → Summary / Detail**, continued across pages; then **Fees** and **Interest Charged** totals.
- The detail legend reads "*Indicates posting date": a date followed by `*` (payments) is a posting date. Charge dates have no mark, so they may be transaction dates and stay flagged for owner review.
- The combined "Total Payments and Credits" is not required when payments and credits are reconciled separately.
- "Fees and Interest Totals Year-to-Date" (for example "Total Interest in 2026") is ignored as a period total; sentences such as "we will debit … your payment of $X" are not totals.

## Capital One

- Range on every page: **"Mon DD, YYYY - Mon DD, YYYY | N days in Billing Cycle"**. The summary's left column (payment due date) shares lines with account-summary values, so the parser prefers the range over a nearby "closing date" phrase and never treats coupon/summary text as rows.
- Detail sections: **"NAME #XXXX: Payments, Credits and Adjustments"** and **"NAME #XXXX: Transactions"**, each with **Trans Date / Post Date / Description / Amount** and year-less dates. Years come from the billing cycle; posted dates inside the cycle are not flagged.
- Payments and credits are listed separately in the summary and combined in the detail; their summary values are added to give the combined section total. Autopay/payment rows default to transfers.
- **Interest Charged** lists "Interest Charge on Purchases / Cash Advances / Other Balances" without dates. Non-zero lines become interest rows on the closing date. "Totals Year-to-Date" values are ignored. Cash advances are not treated as purchases.

## Bank of America (checking)

- Range: **"for Month DD, YYYY to Month DD, YYYY"**. The account summary lists Deposits and other additions, **ATM and debit card subtractions**, **Other subtractions**, and Service fees.
- Detail tables use one **Date / Description / Amount** column set with MM/DD/YY posting dates. Descriptions can contain a second, year-less transaction date ("… 08/19 …"); the first date is the posting date.
- "Withdrawals and other subtractions" contains two separately totaled subsections. They reconcile as **ATM and debit card** and **Withdrawals / subtractions** rather than one combined total.
- A checks section is required only when the statement has one. Marketing text that mentions "checks" is not a section header.

## Statement periods and September tracking

Each billing cycle starts in August, so rows dated before September 1 are reconciled with the statement but excluded from tracking. A statement that ends before September 30 does not cover all of September; mark coverage only through its end date and add the next statement.

## Extraction fields

| Field                  | Rule                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account alias          | `Amex`, `Capital One`, or `Bank of America`; never card numbers or account holder identifiers                                                     |
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

## Current PDF workflow

Choose the account and upload the text PDF locally. The parser groups Payments and Credits, New Charges, Fees, and Interest into separate review sections. Review the entire statement, correct missed rows and dates, classify card payments as transfers, and reconcile every section before the final category/duplicate preview. A discrepancy blocks saving; do not change a total merely to make extraction balance.

Only verified dates from September 1 onward enter tracking after reconciliation. Statement line positions are not bank IDs. Overlap matches require explicit review. Original statements are ignored by Git and must remain outside the repository. Scanned, scripted, malformed, excessive-size/page, and password-protected PDFs are rejected.
