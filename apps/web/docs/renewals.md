# Loan renewal

All implementation and deployment files live in `apps/web`. Android is unchanged.

## Admin workflow

In Clients, **Renew** appears only for a fully paid loan and an administrator.
Good history means each completed loan was fully settled on or before its due date.
A paid loan with late settlement shows a disabled Renew button with the reason.
A pending or overdue unpaid loan has no Renew action.

The due date uses the existing collection calendar, skipping Sundays and configured
holidays. Missing an individual payment date does not itself disqualify a borrower;
principal plus interest must be paid by the final due date. Eligibility uses the
actual date accumulated receipts first reached full settlement. Invalid, future-dated
or pre-approval receipts block renewal. Prior renewals must also have settled on time.

The admin enters the new principal, fixed interest, term (45/50/58), daily payable,
approval date and optional notes, then explicitly approves the terms. Approval defaults
to today and must fall between previous settlement and today. The service uses the
Philippines calendar date. No automatic granting occurs. A new schedule and balance
start from the new approval date, with a fresh, globally reserved five digit transaction
number. The client document ID and public client number remain the same. Old payments
never reduce the new balance or carry over as credit. Any prior excess remains in history.

The **Renewal history** tag opens a timeline with each approval, administrator,
notes, new terms, due date at approval, previous terms, settlement date, closing
balance and previous receipt ledger. Audit records and closed-cycle receipts cannot
be edited or deleted from either app. Clients with renewals cannot be deleted through
the web app. Current-cycle receipt corrections remain available to admins. Editing
the current loan does not rewrite any historical snapshot.

## Trusted service and data model

`functions/src/index.ts` exposes the authenticated `renewClient` callable in
`asia-southeast1`. It obtains the role and administrator name from `users/{uid}`.
In a Firestore server transaction it reads the current client, their payments,
holidays, previous renewals and identifier counter, then validates eligibility again.
Stale loan IDs/transaction numbers and duplicate requests are rejected. The new loan,
immutable event, counter and reservation commit together or change nothing.

Server transaction queries provide serializable isolation, rather than trusting
browser-calculated balances. See [Firebase transaction isolation](https://firebase.google.com/docs/firestore/transaction-data-contention).

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
npm.cmd --prefix functions ci
npm.cmd test
npm.cmd run test:renewals
npm.cmd exec playwright test
npm.cmd run build
```

The backend uses Node.js 22. esbuild bundles the shared pure loan logic into
`functions/lib`, so Firebase receives self-contained backend JavaScript. Both
dependency trees have lockfiles. Emulator tests use only `demo-mcl-policy` on
localhost:8188 and reject production project configuration. They cover successful
renewal, authorization, partial/late settlement, forged eligibility, concurrent and
duplicate requests, second renewal, incomplete/late history, exhausted transaction
numbers, cycle boundaries and immutable audit permissions.

The live callable and rules are **not deployed by editing these files**. Update
Android cycle handling before renewing borrowers serviced by collectors. Deploy
the web app and backend changes together to the intended Firebase project.
Deployment requires Firebase's Blaze plan; see the
[official Cloud Functions setup guide](https://firebase.google.com/docs/functions/get-started).

```powershell
npx firebase-tools deploy --only "functions:mcl-renewals,firestore:rules" --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

The predeploy step builds the backend. Do not deploy the old repository-root rules;
they omit settings, payment-policy and renewal protections. Local test commands
do not change production rules, functions, billing plans or customer data.
