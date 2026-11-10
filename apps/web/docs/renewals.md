# Loan renewal

The renewal service and deployment files live in `apps/web`; the hybrid Android
administrator workspace imports that shared service. Native Android variants have
separate renewal implementations.

## Admin workflow

In Clients, **Renew** appears only for a fully paid loan and an administrator.
Good history means each completed loan was fully settled on or before its due date.
A paid loan with late settlement shows a disabled Renew button with the reason.
A pending or overdue unpaid loan has no Renew action.

The due date uses the configured collection calendar. Sundays count by default;
Settings → Configurations → Loan schedule can enable Sunday skipping. Configured
holidays are always excluded. Missing an individual payment date does not itself disqualify a borrower;
principal plus interest must be paid by the final due date. Eligibility uses the
actual date accumulated receipts first reached full settlement. Invalid, future-dated
or pre-approval receipts block renewal. Prior renewals must also have settled on time.

The admin enters the new principal, fixed interest, term (30/45/50/58), daily payable,
approval date and optional notes, then explicitly approves the terms. Approval defaults
to today and must fall between previous settlement and today. The service uses the
Philippines calendar date. No automatic granting occurs. A new schedule and balance
start from the new approval date, with a fresh, globally reserved five digit transaction
number. The client document ID and public client number remain the same. Old payments
never reduce the new balance or carry over as credit. Any prior excess remains in history.

The **Renewal history** tag opens a timeline with each approval, administrator,
notes, new terms, due date at approval, previous terms, settlement date, closing
balance and previous receipt ledger. Audit records and closed-cycle receipts cannot
be edited through either app's ordinary receipt controls. Clients with renewals can be
recycled through the web-only [Trash workflow](./client-trash.md), which preserves their
history for restoration. Confirmed permanent deletion from Trash removes payments and
renewal history; receipt audit events and identifier reservations remain. Current-cycle
receipt corrections remain available to admins. Editing
the current loan does not rewrite any historical snapshot.

## Firestore service and data model

`src/services/renewals.ts` performs renewal directly using the Firestore browser SDK.
Each transaction rechecks the active admin/developer profile and reads the current
client, receipts, holidays, current loan-schedule policy, previous renewals, and identifier counter. It validates
eligibility again. Stale loan IDs, transaction numbers, revisions, and duplicate approvals
are rejected. The new loan, immutable event, counter, and reservation commit together.

Firestore rules require an admin/developer and a matching history record for a cycle
transition. They validate the transition, snapshots, actor, timestamps, and basic terms.
Settlement totals and the holiday-based schedule are assessed by the web service;
rules cannot sum an arbitrary receipt query or recompute the collection calendar.
The service queries the server and tracks every returned document in the transaction,
so edits/deletions trigger retries. The browser SDK cannot lock a query against new
matching receipts from another device. Avoid concurrent corrections/collections while
approving renewal. See [Firebase transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

The schedule preference is read inside the transaction, including automatic retries,
so current eligibility and the new archived due date use the same saved policy.
Changing the preference recalculates active loans; it never rewrites immutable
renewal snapshots. The matching optional Cloud Function also reads this preference.
Publish the updated rules before granting 30-day renewals or enabling collector
reads of `settings/Configurations/elements/loanSchedule`.

| Location / field | Meaning |
| --- | --- |
| `clients/{clientId}.activeLoanId` | Absent on original loans; new five digit transaction number after renewal |
| `clients/{clientId}.renewalCount` | Number of granted renewals |
| `clients/{clientId}.originalTransactionNumber` | Original loan transaction number, retained for reports |
| `clients/{clientId}/renewals/{transactionNumber}` | Immutable event: sequence, previous/new loan and client snapshots, prior paid amount, settlement/due dates, new due date, actor, notes and server timestamp |
| `payments/{receiptId}.loanId` | Owning loan cycle; missing or `initial` means the original loan |
| `settings/Configurations/elements/counters.transactionSequence` | Shared counter for new clients and renewed loans |
| `settings/Identifiers/transactions/{number}` | Permanent reservation; renewals include clientId and loanId |

The event ID, activeLoanId and new transactionNumber are the same unique five digit
string. Original receipts need no copying or migration. Index cards, balances,
payment entry and consolidation use the active cycle. Daily summaries and dashboard
collections retain actual receipts across all cycles; same-day summary transaction
cells list every involved transaction number. History is subscribed to only while
its modal or renewal assessment is open. The existing browser-wide payment subscription
still loads all receipts; this change does not introduce an aggregated balance service.

## Android integration before enabling collector renewals

The current Android app sums receipts by clientId and does not send loanId. It must
be updated before collectors work with renewed borrowers. Otherwise its displayed
balance may be wrong and the prepared rules reject untagged writes for renewed
clients. Unrenewed clients retain their existing format and behavior.

Read `activeLoanId` from the client, defaulting to `initial`. Calculate current
balance using only receipts whose `loanId` (also default `initial`) equals that ID.
Capture loanId alongside the payment form and send it with every receipt. Refresh
the client before submitting; never relabel a queued receipt to a new cycle. Reject
and review stale cycles. Keep server createdAt and current approval-date/minimum
validation. Collectors cannot read or write the admin-only renewal events.

See [Android development context](./android-development-context.md). No Android
source is modified by this change.

## Build, verify and activate

From `apps/web`:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:spark
npm.cmd exec playwright test
npm.cmd run build
```

No functions package installation or build is needed. The Spark emulator suite runs
the actual web services with Firestore rules against `demo-mcl-policy` on localhost:8188
and rejects live project configuration. `test:renewals` is an alias for this suite.

The website and rules are **not deployed by editing these files**. Update Android
cycle handling before renewing borrowers serviced by collectors. Build the website,
then deploy its rules and hosting to the intended Firebase project. This works on
Spark within its quotas; no Cloud Functions or Blaze upgrade is needed.

```powershell
npx.cmd firebase-tools deploy --only "firestore:rules,hosting" --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

`apps/web/firestore.rules` is canonical; `npm run sync:rules` updates only the repository-root
copy. Neither command rewrites Android rules. Local tests do not change production data,
rules, billing plans, or hosting. The retained `functions/` source is not used by the
website and is excluded from the web deployment configuration.
