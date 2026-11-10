# Print studio and shared configuration

All implementation, derived reference templates, tests and deployment files are under
`apps/web`. The Android app and root Firebase files are unchanged.

## Enable Firebase persistence

The existing root Firestore rules do not allow a `settings` collection. The web app
cannot grant itself database access. A Firebase project administrator must publish
the web-scoped rules once before settings, client number allocation and backfill work.

From `apps/web`, using the Firebase project already configured in `.env.local`:

```powershell
npx --yes firebase-tools login
npx --yes firebase-tools deploy --only firestore:rules --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

Use the actual `VITE_FIREBASE_PROJECT_ID` as `YOUR_PROJECT_ID`. This deploys the full
rules in `apps/web/firestore.rules`; it does not deploy hosting or change Android.
The file preserves the existing client/user/holiday permissions and adds admin settings
access, optional collector `note`/`notes` strings (up to 1,500 characters), and enforcement
of the daily minimum when enabled. Active collectors can read only the payment-policy
settings document; other settings, counters and reservations stay admin-only. All
existing collector receipt fields remain required. Administrators remain responsible
for corrections and may record partial payments/final settlements below the minimum.

Reload the website after publication. After administrator sign-in the web app creates
missing settings documents in a transaction, using the supplied template defaults.
It never overwrites existing settings during initialization. Reads use live listeners;
saves use a transaction with a check against the editor's original values. A concurrent
administrator's edits cause an explicit conflict instead of a silent overwrite.
Permission failures are displayed; they are not reported as successful saves.

The root `firestore.rules` remains unchanged under the web-only editing restriction.
**A later deployment using the root config would restore its older rules.** Continue
deploying the web-scoped rules, or reconcile the root rules when separately authorized.

## Storage paths

Firestore paths alternate collections and documents, so the requested
`settings/{component}/{elements}` hierarchy uses an `elements` subcollection:

| Document | Contents |
| --- | --- |
| `settings/Configurations/elements/general` | Website name; client prefix/digits; default payment note; dashboard limits |
| `settings/Configurations/elements/paymentPolicy` | `enforceDailyMinimum` boolean; false by default; collector-readable, admin-writable |
| `settings/Printables/elements/indexTemplate` | Lender name, branch, mobile, amount basis, yellow heading and blue cell accents |
| `settings/Printables/elements/promissoryTemplate` | Payee, interest/service-charge statement, place of execution |
| `settings/Printables/elements/studio` | Separate paper, orientation, dimensions, margins and font defaults per printable |
| `settings/Configurations/elements/counters` | Monotonically increasing client and transaction sequences |
| `settings/Identifiers/clients/{publicClientId}` | Permanent public client number reservation → client document ID |
| `settings/Identifiers/transactions/{fiveDigits}` | Permanent transaction number reservation → client document ID |

Editable settings include `updatedAt` and `updatedBy`. The counter and reservations
are maintained by the allocator, not editable in the Settings form.

## Client identifiers and compatibility

- New client document IDs are `mcl0001`, `mcl0002`, etc. by default. `clientNumber`
  repeats the public identifier and `transactionNumber` is a five digit string such
  as `00001`; these stay strings to preserve leading zeroes.
- `dailyAmount` is stored as a peso number. Add/edit requires a positive amount;
  "Use suggested daily amount" uses `(principal + interest) / loanTermDays`, rounded
  **up** to the nearest centavo. The saved value can be customized independently.
- One transaction reads the current ID configuration and counters, checks occupied
  IDs/reservations, then writes the client, counter and both reservations atomically.
  Concurrent administrators cannot allocate the same generated number.
- On sign-in, existing clients receive missing `clientNumber`, `transactionNumber`
  and `dailyAmount` fields. Their existing Firestore document IDs **do not change**.
  This preserves Android references and all existing `payments.clientId` values.
  The Settings button retries an interrupted backfill. Partial progress is safe to
  retry; a deleted client is not recreated.
- Format changes apply to future allocations. Sequences do not reset when changing
  the prefix/digit count. Existing public IDs and transaction numbers stay stable.
- Reservations survive deletion. Numbers are never recycled. Five digits support
  99,999 client transactions. Exhaustion fails with no partial allocation; the app
  never truncates a number or silently wraps to zero.
- Do not manually change allocated IDs, counters or reservations in the console.
  These guarantees cover records created by the allocator; manually imported,
  already-numbered documents require corresponding unique reservations.

The Android source is unchanged. Its existing client reads tolerate the additional
fields and its existing payments feed these printables through the shared ledger.
The current Android source does **not** provide a note input. The web reads `notes`
or legacy `note` when present, and otherwise uses the configurable default, initially
"Daily Payment". Adding a note input on Android requires a separate authorized change.

## Consolidation / Liquidation and payment policy

Consolidation / Liquidation is a website-only ledger based on `consolidation_ref.xlsx`.
It uses the existing shared client/payment subscriptions; it does not create report
documents or issue a separate Firestore query per client. Each row shows name,
transaction number, public client ID, release/approval date, term, 58 sequential paying
day columns, total payment, principal, **Payable Amount (principal + fixed interest)**
and **Balance (Payable Amount − total payment)**. Principal is shown for reference
and is not the amount used to subtract repayments. The client's
30/45/50/58 endpoint cell is highlighted. Receipts on the same collection date are summed;
missed dates introduce no gaps. Click a payment or the history link to inspect dates,
receipt counts and all later days, including days after 58 and receipts after payoff.
Those later receipts remain in totals. Negative balances are intentionally retained.

Search and term filters apply to the full ledger. The bottom grand totals and top
summary cards cover **all matching clients**, across pages. The table offers pagination,
frozen names, sticky headers and horizontal navigation to the final total columns.
There are no print/export actions for this page.

Use **Configure dates** to open the calculation window. Choose All dates, Today,
Yesterday, Last 7 days, Last 30 days, This month (through today), Last month, or
Custom dates. From and To are inclusive calendar dates matched against `paymentDate`,
not the time the receipt was entered. Preview totals and receipt counts before
applying; Cancel preserves the applied window. Missing, invalid or reversed dates
cannot be applied. Clear dates restores the full ledger.

The selected dates apply to amounts, history, summary cards, progress and grand totals
across every matching page. Original paying-day numbers remain in place so date filters
do not move loan endpoint highlights. Clients with no matching receipts remain visible
with zero total payment. Full payable amounts remain unchanged: the selected-window
balance deducts **only payments within From–To**, as requested, and does not represent
historical closing debt. Only current loan cycles are included, not archived renewal
cycles. No report documents or shared schema/rules changes are required.

**Net Income** is shown per loan, in the summary cards, payment-history totals,
window preview and grand total. It is the sum of **Payable Amount − Principal** for
the matched current loans. For example, principal PHP 10,000 plus PHP 1,250 fixed
interest gives payable PHP 11,250 and contracted interest PHP 1,250. This requested
report label represents expected interest before collection and expenses, not actual
net profit: expenses, taxes, losses and recognition of earned income are not tracked
by this worksheet. Date windows change included receipts and balances; they do not
prorate the full contracted interest. Client/term filters change the income total,
and pagination does not limit the grand total to the visible page.

Administrators and developers can use **Payments → Edit** to correct a collector's
amount, collection date or notes. The original collector and recorded timestamp are
preserved, and corrections update existing receipts. The service checks permissions,
loan-cycle identity, the latest receipt and refreshed payable balance before saving.
Concurrent corrections require reopening the editor; retrying an identical successful
correction is safe. Collectors cannot edit receipts. Live client balances, index-card
entries and consolidation reflect the correction through the existing subscriptions.

Client cellphone numbers are optional. Leave the field blank or enter N/A; both save
as the existing empty string representation. Supplied phone numbers still require a
valid mobile format. No new Firestore field or Android migration is needed.

Long client-list addresses are ellipsized to one bounded line. Hover reveals the full
address; clicking or keyboard activation opens a wrapped, readable address dialog.

Settings → Configurations → Payment policy controls whether each collector receipt
must meet `dailyAmount`. Off keeps that amount informational. On enforces a minimum
per receipt, without imposing a cap at the daily amount. Web administrator entries
remain available for smaller partial payments and final settlements. Existing Android
builds are subject to the rule after publication, even though their input UI has not
yet been updated. The [Android development README](./android-development-context.md)
describes the required policy read, validation message and shared data contract.

## Printable behavior

### Index Card

The supplied workbook uses four columns, down each column before moving right,
with a yellow `#f5efa5` heading and theme-accent blue `#a1bfcd` cells. The web template
preserves that arrangement, proportions, labels and accents, adding the existing
logo and compact client/transaction references. Signatures remain empty.

The workbook does **not** contain a paper size, orientation or print area. Its column
widths and occupied row heights yield an approximate 238 × 122 mm baseline for a
45-day card. Template height grows by 5.08 mm per extra row for 50-/58-day loans.
The studio defaults to **A4** for index cards, promissory notes and daily summaries.
Index cards and daily summaries start in landscape; promissory notes start in
portrait. Untouched former template defaults migrate to A4; explicitly saved Letter,
Legal, custom dimensions and customized template layouts are preserved. New saved
paper choices carry `paperDefaultVersion: 2`, so a later explicit Template size
selection is not migrated again. HTML, PDF/browser printing and generated DOCX use
the selected document's page dimensions. Reset print options restores its saved layout.

The studio allows other standard paper sizes and explicit custom dimensions when a
particular physical card size is required. It does not claim an unspecified physical
size was copied exactly.

Name, address, approval date, term and daily amount come from the selected client.
Every index card, including continuation cards, also shows the automatic due date
from the same loan schedule used in client loan information. It uses the active
loan's approval date and term, excludes configured holidays, follows the saved
**Skip Sundays** preference (Off by default), and respects
the shared approval-day counting setting. This date is retained in print/PDF, HTML
and Word exports and cannot be edited independently in the print studio.
The amount can show principal alone or principal + interest. This display preference
does not change the balance: outstanding is always principal + fixed interest less
all repayments.

Each **paying date** is one sequential numbered slot, sorted chronologically. Multiple
receipts on the same date are combined into that slot, regardless of whether they
were entered on Android or the web. Missed dates introduce no gap. Backdated entries
and deletions rederive the numbering from the current ledger. Payment days are distinct
from the calendar collection days used to calculate loan due dates.

Entries continue past the planned loan term using additional cards, until the
outstanding amount reaches zero. The payoff slot retains the actual collected amount,
including a historic overpayment; later receipts are not printed as extra loan days.
The source payment documents are never rewritten to produce the card.

### Promissory Note

The supplied DOCX is the source of both `src/templates/promissory.docx` and the HTML
preview. Its A4 size, 12.7 mm margins, Calibri typography, paragraph order, emphasis,
clauses, acknowledgment and notary section are retained. The heading is corrected to
**ACKNOWLEDGEMENT**. The requested more open layout uses approximately 1.18 line spacing,
2 pt paragraph gaps, and more room in the signature fields, in both the browser template
and DOCX. The remaining clause wording and split numbered clause stay as supplied.
The browser preview represents the principal/date row and signature
fields in aligned columns, preserves explicit source fonts (including Bell MT for
the acknowledgment heading), and follows the revised centered acknowledgment headings.
The signature section uses two fixed columns with six shared rows in both HTML and
native Word tables: signature/name, signature label, valid ID, ID number, issue details
and contact number. The reference's 12.7 mm field indent is applied consistently, so
long borrower names cannot displace the corresponding Co-Maker fields. The remaining
Word paragraph/run structure is retained. The revised reference
removes the old bottom CO-MAKER/DEBTOR identity boxes; neither preview nor export adds
them back.

Principal and approval date come from the client. The promised total is principal +
fixed interest, including centavos in words. Term, borrower, address and saved daily
amount are populated. Payee, statement and execution place come from settings. Editing
the statement changes its text only; it does not recalculate the client's fixed interest.
The sample borrower's ID number, any embedded identity photograph, and Office document
properties are removed from the reusable assets. Both parties' ID fields,
co-maker details, issue details, court venue, notary details and signatures remain blank.

The preparation script is reproducible and reads the original without modifying it:

```powershell
python scripts/prepare-print-templates.py C:/path/to/promissory_ref.docx
```

### Daily Summary Sheet

Includes **every client by default**, sorted by last, first and full middle name, with index,
transaction number, public client ID, amount collected on the chosen date, date,
collectors and notes. Clients without collections show zero and blank collector/note
markers. Multiple collectors and distinct notes are retained, separated with semicolons.
Today is the default date; historical reports are available using the date control.
The final page contains one grand total. Every page has a heading and page number.
Search and bulk checkboxes can restrict the report to selected clients. A filtered
report identifies how many clients were selected out of the available total; its
grand total covers only those selected clients, including in Word exports.

## Printing and exports

- A mode switch above the document tabs offers **Printing Mode** and **View Only**.
  Printing Mode includes paper controls and print/export actions. View Only hides those
  actions and layout editing while retaining client search, date selection, zoom and
  the size grid for inspection. Switching modes preserves the selected clients and layout.
- All printables share client search by partial name, public or legacy client ID, or
  transaction number. Search ignores case, accents and punctuation, accepts name words
  in any order, and ranks exact identifiers first.
- Enable **Bulk printing** to select individual client checkboxes. **Select all matches**
  adds all search matches; **Clear selection** removes all checked clients. Search filters
  the result list and does not silently add/remove selected clients. Client documents
  share their selection between Index Card and Promissory Note; the summary keeps its
  own selection, initially all clients. Only the selected clients are printed/exported.
- Studio controls: per-document paper size, portrait/landscape, custom dimensions,
  margins, font, zoom, hide/show 10 mm grid, current-options reset, and selected-client batches.
  The grid spacing tracks zoom and is excluded from all exported documents.
- Shared defaults are saved in Settings. Studio overrides last while the page is open
  and reset to the currently saved defaults. Reset keeps the chosen clients and does
  not change database settings.
- Print and Save PDF print only the document iframe, excluding website navigation and
  controls. Save PDF opens the browser dialog; select its **Save as PDF** destination.
  Match paper size, use 100% scale, enable background graphics and disable browser
  headers/footers. A printer must support the selected custom size for physical cards.
- DOCX exports are real Office ZIP/XML documents. The note uses its sanitized source
  document; index and summary exports use native Word tables. Multiple client documents
  download as a ZIP containing one DOCX per client. Word may reflow content depending on
  installed fonts and pagination; PDF is the consistent preview output.
- HTML export embeds the logo and all styles for a standalone document with no external
  image dependencies. Files contain the selected client information and ledger values.
- Invalid settings, failed data feeds, incomplete number allocations and unready previews
  disable printing. Measured content overflow also disables printing/PDF rather than
  clipping it; choose larger paper, a smaller font/margins or shorter template text.
  HTML/DOCX exports retain overflowing content. Printable text is escaped before rendering.

## Validation

The Clients list paginates after searching, filtering and sorting the full live client
list. It defaults to 25 clients per page and offers 10/25/50/100 rows, numbered pages,
First/Previous/Next/Last controls and an accurate result range. Search, status and page
size changes return to page one. Live removals clamp the current page to the last
available page. This paginates the UI; the shared Firebase subscription remains live
for the dashboard, reports and balances.

```powershell
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
npm.cmd exec playwright test
```

Browser tests use installed Google Chrome and local synthetic fixtures, block Firebase
network access, and check all three terms, reset/grid controls, actual Word ZIP contents,
batch export, mobile layout, summary pagination, PDF paper dimensions and blank-page
counts. Artifacts go to ignored `.tmp/`. Unit tests cover numbering, payoff, same-day
receipts, totals, money wording, validation, atomic allocation calls, legacy preservation,
exhaustion, settings initialization and stale-setting conflicts.

Firestore policy tests run against the isolated `demo-mcl-policy` emulator project on
127.0.0.1:8188. They cover on/off behavior, live toggle changes, legacy fallback amounts,
collector permissions and administrator settlements. The runner can use Android Studio's
bundled JDK on Windows and keeps emulator downloads in ignored `.tmp/`.
These tests do not change live customer records or publish rules. Live Firebase
deployment is still a separate administrator action.

Renewed clients use separate loan cycles: index cards, balances and consolidation
use the active cycle, while actual daily collections retain all cycles. See the
[renewal guide](./renewals.md) for immutable history, the trusted admin endpoint,
backend deployment and Android's required loanId integration.
