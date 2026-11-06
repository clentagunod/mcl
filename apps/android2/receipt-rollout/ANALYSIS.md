# Receipt concurrency rollout analysis

Development target: isolated `demo-mcl-receipts-v1`, Firestore Standard emulator (`edition: standard`). Production target is configured as `mcldb-143d3`, but its database edition and active deployments are unverified because Firebase CLI authentication is absent. No production writes are authorized by this bundle's test scripts.

## Existing contract and access patterns

- `users/{uid}`: profile role/admin/collector/developer, active status, display name and account PII. Owner sign-in reads and privileged active-admin account management are existing application requirements. Account queries select admin/collector roles; developer profiles stay private. These role boundaries are preserved.
- `clients/{id}`: borrower PII, principal/interest/daily payable, approval ISO date, term, transaction and cycle identifiers. Foreground queries order by updatedAt, bounded to 100, with cursor scans for complete cache snapshots.
- `payments/{id}`: immutable attribution, amount, ISO payment date, client/cycle, notes, server creation timestamp. Queries order by createdAt and/or filter clientId. IDs are reserved before writes and retained for uncertain acknowledgements.
- `clients/{id}/renewals/{transaction}`: immutable old/new loan snapshots, payment/eligibility dates, sequence and approver. Queries order by sequence descending; backend cache scans are bounded.
- `clientTrash/{id}`: exact archived client, deletion identity/date, trashId and trashed/purging status. Queries use deletedAt ordering/cutoffs and status=purging (bounded 25/100). Restore preserves the original client. Purge is resumable and removes history in batches.
- `clientTrashOperations/{id}`: immutable selection key and actor with pending/complete status, addressed directly.
- `settings/Configurations/elements/*` and `settings/Printables/elements/*`: direct configuration reads. General counters and client/transaction identifier reservations are active-admin managed.
- `receiptDeletions/{id}`: immutable original receipt and deleting actor/date. Existing correction UI deletes a receipt and creates a new one; it does not use in-place updates.
- `receiptAudit/{id}`: read-only legacy callable audit. The retained Admin SDK functions are not configured in the root deployment file. Any previously deployed callable must be disabled or adapted before claiming enforcement, since Admin SDK bypasses rules.

## New invariant

`loanBalances/{clientId}` is a protected current-cycle counter. It stores integer paidCents, cycle, monotonic revision, one operation and one receiptId, plus server timestamp. Total cents is derived separately from client principal and interest, rather than trusting a submitted limit. Every create/delete changes the shared counter in the same transaction. Both the receipt rule and counter rule bind to exactly the same receipt and exact cent delta. This prevents two IDs from consuming the same balance and prevents a multi-receipt batch from sharing one counter delta.

Financial client edits must retain paid cents and increment the counter revision; renewal can reset only a fully settled old cycle and must change the cycle/history atomically. Receipt writes cannot also change loan terms. Counters survive trash, restore and purge to prevent ID reuse. Missing or malformed counters fail closed; imported/overpaid histories require reconciliation, not silently clamped totals.

`settings/receiptControl/current/config` is explicitly excluded from the broad settings wildcard. Only trusted Admin SDK tooling may set its `enabled`/`mode` control. Missing/disabled control pauses financial writes, client creation, renewal and trash lifecycle changes during bootstrap. Existing active and archived loans require audited, privileged initialization before enabling the protocol. Partial legacy purges must be resolved before bootstrap.

## Verification and boundaries

Rules tests must cover positive role/query workflows and adversarial missing-counter, ledger-only, attribution, date, money, replay, stale-cycle, multi-receipt, correction, renewal and archive races. Actual web-service integration must be compiled using the staged overlay, not tested against obsolete direct writers. Android uses the same field contract and integer arithmetic.

Files under `web/` and the rules in this directory are staged replacements for sibling web/root files, not live edits. Do not deploy these rules alone or install the coordinated financial-write APK before completing the documented rollout. Production edition, deployed privileged writers and IAM remain explicit pre-deployment checks.
