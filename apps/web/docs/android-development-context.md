# Android collector app: development context

This README is stored under `apps/web/docs` because the current work permits edits
only under `apps/web`. The Android source has been read for compatibility and remains
unchanged. This document describes the shared contract and the next Android changes.

## Renewal integration requirement

The web now supports admin-only renewal. **Before collectors service renewed loans,
Android must become aware of loan cycles.** Its current clientId-only sum would count
old receipts against the new loan. The prepared rules reject untagged or stale-cycle
writes for renewed clients instead of silently misapplying them. Unrenewed clients
keep their original behavior.

- Read `clients/{id}.activeLoanId`, default `initial`, and `renewalCount`.
- Read optional `payments/{id}.loanId`, default `initial`.
- Sum only receipts matching both clientId and active loanId for balances/index days.
- Capture loanId when opening payment entry, refresh the client before saving,
  and include that same loanId in the receipt. Do not retag queued receipts after renewal.
- Refresh transaction number, principal, interest, daily amount, term and approval
  date after a cycle change; restart tracking against the new approval date.
- Keep original receipts. Daily actual collections can span multiple loan cycles.
- Renewal is granted by an authenticated server function after admin approval;
  collectors cannot grant renewals or read private renewal history.

Closed-loan receipts and renewal history are immutable. The original transaction
number is retained as `originalTransactionNumber`; subsequent loanIds equal their
five digit transaction numbers. See [renewal workflow, deployment and tests](./renewals.md).

## Current architecture

- Web administrators manage clients, loan details, collector accounts, holidays,
  print templates and shared settings. React's `DataProvider` opens one live set of
  Firestore subscriptions for the website.
- Android is a collector app using Firebase Authentication, Firestore and Kotlin
  coroutines. It shares the same Firebase project and `(default)` database.
- Relevant Android files (read-only references):
  - [`CollectorRepository.kt`](../../android/app/src/main/java/com/mcl/mcllendingapp/data/CollectorRepository.kt): role/session checks, server client reads and repository interface.
  - [`LoanPayment.kt`](../../android/app/src/main/java/com/mcl/mcllendingapp/data/LoanPayment.kt): money parsing, balance reads, receipt validation and transaction writes.
- Current Android client models contain document ID and name fields. They do not yet
  include the website's public client number, transaction number, daily amount or
  payment-policy setting. Current receipt writes do not include notes.
- The repository uses a memory cache, explicit server reads for clients/balances and
  server-confirmed profile checks. Preserve the distinction between cached information
  and a confirmed successful payment.

## Authentication and permissions

Sign in with the collector's Firebase email/password account. Read `users/{auth.uid}`
and require `role == "collector"` with `active != false`. Recheck profile changes and
clear the session when authorization is revoked. Web administrators create collector
accounts using a separate Auth instance so provisioning does not replace their session.

With the web-scoped rules published, an active collector can:

- Read clients, payments and holidays.
- Read **only** `settings/Configurations/elements/paymentPolicy` from the settings tree.
- Create payments under their own `collectorId`, subject to receipt validation and
  the minimum-payment policy.

Collectors cannot update/delete receipts, change clients, allocate IDs or edit settings.
They cannot list the settings collection or read identifier counters/reservations.
Administrators retain correction and partial/final settlement access.

## Shared data contract

### Client: `clients/{documentId}`

| Field | Type | Meaning |
| --- | --- | --- |
| `lastName`, `firstName`, `middleName` | string | Borrower name; middle name can be empty |
| `address`, `cellphone` | string | Address and mobile contact |
| `principal` | number | Amount lent, in pesos |
| `interest` | number | Fixed interest in pesos, not a percentage |
| `loanTermDays` | number | 30, 45, 50 or 58 |
| `approvalDate` | string | Calendar date, `YYYY-MM-DD` |
| `dailyAmount` | number | Saved agreed daily payable amount |
| `clientNumber` | string | Public client identifier, e.g. `mcl0001` |
| `transactionNumber` | string | Five digit loan transaction number, e.g. `00001` |

**Use `documentId` as `payments.clientId`.** Existing clients may have legacy random
Firestore document IDs even when `clientNumber` is `mcl0001`. The web backfill adds
missing fields without renaming documents or changing payment references. New document
IDs use the configured prefix/digits. Treat identifiers as strings and preserve zeroes.
Android must never allocate or increment client/transaction numbers.

For a legacy client without a positive `dailyAmount`, derive the suggested amount as
`(principal + interest) / loanTermDays`, rounded **up** to two decimals. In Kotlin use
decimal arithmetic:

```kotlin
val daily = savedDailyAmount?.takeIf { it > BigDecimal.ZERO }
    ?: (principal + interest).divide(BigDecimal(loanTermDays), 2, RoundingMode.CEILING)
```

The saved value may intentionally differ from the derived suggestion. Do not overwrite
it in Android or silently recalculate a manually agreed amount.

### Receipt: `payments/{receiptId}`

Required fields:

```text
clientId       string     actual clients document ID
amount         number     positive peso amount
paymentDate    string     YYYY-MM-DD collection date
collectorId    string     signed-in Firebase Auth UID
collectorName  string     collector profile fullName
createdAt      timestamp  FieldValue.serverTimestamp()
loanId         string     required after renewal; activeLoanId captured at entry
```

Optional `notes` (preferred) or legacy `note` is a string of at most 1,500 characters.
The website uses `notes`, then `note`, then the configured default (`Daily Payment`
initially). The default note is an admin setting; collectors do not need access to
the general settings document. Omitting notes remains backwards-compatible.

Generate a receipt ID once per submission attempt and reuse that ID when retrying an
uncertain acknowledgment. The existing `FirebasePayments.save(id, ...)` already checks
an existing receipt before creating another. Show success only after the server write
is acknowledged. Do not write a separate balance, index day or consolidation day.

## Daily payable restriction

Path: **`settings/Configurations/elements/paymentPolicy`**

```json
{ "enforceDailyMinimum": false }
```

This is saved by the website under Settings → Configurations → Payment policy.

- `false` (default): daily payable is information only. Collectors can submit smaller
  or larger positive payments, subject to the app's outstanding balance validation.
- `true`: **each collector receipt** must be at least the client's agreed daily amount.
  There is no cap at that amount; larger receipts remain allowed. Two small receipts
  do not combine to bypass the per-receipt minimum.
- The current web administrator role can enter smaller partial payments or final
  settlements. If a collector's remaining balance is below the agreed minimum, direct
  them to an administrator for settlement; do not increase the receipt beyond the
  money actually collected.
- The server rule reads the current policy at write time. An old Android build cannot
  bypass it by omitting a policy read or by using cached settings.
- A genuinely missing policy document defaults to informational behavior for migration.
  A permission/network failure is not evidence that restriction is disabled.

Suggested Android read (add this in a separately authorized Android change):

```kotlin
val policy = db.document("settings/Configurations/elements/paymentPolicy")
    .get(Source.SERVER).await()
val enforce = policy.getBoolean("enforceDailyMinimum") ?: false
require(!enforce || amount >= daily) {
    "Minimum collection is ${daily.toPlainString()}. Ask an administrator to record a smaller payment."
}
```

Extend `LoanBalance` or the payment-screen state with `dailyAmount` and the policy flag.
Read/listen to the single policy document, display the daily amount and whether it is
informational or required, and provide a useful message on `PERMISSION_DENIED` if the
policy changed during entry. Keep the database rule as the final enforcement point.
Collectors must not query the whole settings subcollection, because that is denied.

The original six-field Android receipt shape still works for unrenewed clients. Renewed
loans require loanId as described above. Until its
UI is updated, an enabled minimum rejects an undersized receipt at the server and the
old Android app may display a generic error instead of the dedicated minimum message.

## Money, dates, balances and reports

- Parse user input as `BigDecimal`, with at most two decimal places. Convert to the
  existing Firestore number format only at the persistence boundary. Avoid `Float`.
- Approval/payment dates are calendar dates, not timestamps. Keep `YYYY-MM-DD`; do not
  shift them through UTC timestamp conversions. `createdAt` is a real server timestamp.
- Loan outstanding: `max(0, principal + interest − current-loan payments)`. Existing Android
  validation checks positive amount, approval date and server-read outstanding amount.
- The website's Consolidation / Liquidation sheet uses **Payable Amount = principal +
  interest**, with principal displayed for reference, and **Balance = Payable Amount −
  included current-loan payments**, without clamping. A configured From–To window
  includes only collection dates inside those inclusive bounds; its balance is a
  period calculation, not a historical closing balance. Negative balance means included
  payments exceed the payable amount. Do not replace loan outstanding with this report figure.
- Consolidation's requested **Net Income** label means full contracted interest:
  `sum(payableAmount − principal)` for matched current loans. It is not collected
  interest or profit after expenses. Receipt date windows do not prorate it.
- Index-card and consolidation day numbers are chronological **paying dates**, not
  elapsed calendar dates. Combine multiple same-date receipts. Skipped dates leave no
  gaps; backdated receipts/admin corrections can renumber subsequent paying dates.
- The consolidation matrix has 58 visible day columns for all loan types and highlights
  the client's 30/45/50/58-day endpoint. All later receipts remain in totals and history.
  Date windows keep original paying-day positions instead of renumbering them.
  Android does not need to write anything special to populate this view.
- Client `cellphone` remains a string; a blank value means unavailable and is shown
  as N/A by the website. Index-card due dates use the same approval date, term,
  configured Sunday skipping, holidays and approval-day policy as loan info; no saved due-date field is added.
- Web administrators can correct payment amount/date/notes in place while retaining
  the original collector identity and `createdAt`. Existing Android payment listeners
  receive these updates without a document-shape change. Collector write permissions
  remain create-only under the existing rules.
- Daily Summary Sheet uses the selected actual collection date and stored collector
  names/notes, not the numbered index day.

The shared schedule preference is **`settings/Configurations/elements/loanSchedule`**:
`skipSundays` is a boolean, with missing documents/fields defaulting to **false**.
Sunday is an ordinary loan day when false; when true, Sundays are excluded. Existing
configured holidays are always excluded. Administrators save this document with
`updatedAt` (server timestamp) and `updatedBy` (their UID). Rules validate those fields.
Active collectors may get/listen to this exact document; listing settings or changing
the policy remains forbidden. Do not fetch the whole settings collection as a collector.

The web's live loan summaries, status badges, renewal eligibility and printed due
dates use the saved preference. Renewals read it in the transaction; archived dates
remain immutable. The hybrid `apps/android/mobile` adapter consumes the same shared
calculation and exact-document policy subscription, and passes the actual holiday
calendar to shared index-card rendering. Rebuild that application to include these
source changes; publishing web code does not update installed APKs.

Native Android variants have separate business logic. In particular, the legacy
`apps/android2` implementation validates only 45/50/58 and always excludes Sundays;
it has not been changed by this web update. It must gain 30-day support and consume
the shared preference before it can display this calendar consistently. Do not assume
unchanged installed native builds adopt a new web setting automatically.

The current server-read balance check occurs before a receipt transaction. It does not
serialize aggregate balances across concurrent collectors. A future requirement for
strict cross-device overpayment prevention needs an authoritative transactional balance
or server endpoint; the new minimum rule does not claim to provide that aggregate lock.

## Development and validation

The web-scoped Firestore rules in `apps/web/firestore.rules` must be published before
the payment policy is enforced in the live Android app. See [setup instructions](./print-studio.md#enable-firebase-persistence).
The web rules and root deployment copy must stay synchronized with `npm run sync:rules`.
This update extends renewal terms to 30 days and grants the exact loan-schedule read
described above. Publish that shared ruleset before deploying the new web/hybrid builds.
No client/payment document fields are renamed or removed.

From `apps/web`:

```powershell
npm.cmd test
npm.cmd run test:rules
npm.cmd exec playwright test
npm.cmd run build
```

`test:rules` uses the isolated `demo-mcl-policy` project and Firestore emulator on
127.0.0.1:8188. It never uses production customer data. It needs Java 21 or later and
downloads the emulator into ignored `.tmp/`; on Windows the runner can use Android
Studio's bundled JDK. Rules tests cover disabled/enabled policy, live toggles, saved
and legacy daily amounts, administrator settlements, role/field validation, and the
collector policy-read permission boundary.
