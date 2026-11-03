# Transactional receipt rollout

The new `writeReceipt` callable serializes payment creates, corrections, and deletions by locking
and advancing `clients/{id}.receiptRevision` in the same server transaction as the receipt.
It reads current-cycle receipts inside that transaction and does not need a balance backfill.
It derives actor identity from Firebase authentication, checks the current policy and loan cycle,
preserves original `createdAt`, and writes immutable before/after events in `receiptAudit`.

Receipt data fields and existing loan IDs remain compatible. Legacy initial receipts without
`loanId` continue to belong to `initial`. Deleted receipt retries are recognized from their
operation audit record and cannot resurrect the receipt.

## Local checks

From `apps/web`, install dependencies with `npm ci` and `npm --prefix functions ci`.
Run `npm test`, `npm run build`, and `npm run test:renewals`. The last command runs policy,
renewal, and receipt integration tests against the demo Firestore emulator. No live project
credentials or customer data are needed for those emulator tests.

To run the opt-in browser retry case, start the test runner with both
`VITE_RECEIPT_BACKEND=callable-v1` and `MCL_TEST_RECEIPT_BACKEND=1`, then run
`npx playwright test receipt-backend.e2e.ts`. The test mocks the callable and blocks
production database requests. Leave these variables out of default compatibility builds.

## Production steps requiring separate approval

1. Confirm the chosen Firebase project and receipt retention/deletion policy. Review all active
   Android versions and any external/native integrations that write to `payments` directly.
2. Deploy the reviewed functions and canonical rules from `apps/web` with explicit
   `--config firebase.print-studio.json --project YOUR_PROJECT_ID` arguments.
   Keep `settings/Configurations/elements/receiptPolicy.backendOnly` absent or false initially.
3. In a test project, set build variable `VITE_RECEIPT_BACKEND=callable-v1`, rebuild the website
   and Android APK, and exercise ordinary collection, final settlement, correction, deletion,
   simultaneous collection, revocation, renewal, interrupted save, and retry after restart.
   A callable failure never falls back to a direct write.
4. Release those compatible builds. The existing default leaves the old write path available;
   that compatibility period does **not** guarantee global overpayment prevention or complete
   correction audit coverage. The retained native collector classes are not the launch UI and
   still use the old write path; any external use must be upgraded before enforcement.
5. Only after incompatible writers have been retired, set
   `settings/Configurations/elements/receiptPolicy` to `{ backendOnly: true }` using a trusted
   administrator. This is a live configuration mutation and is not done by the code change.
   The rules then reject all direct receipt creates, updates, and deletes for both roles.
6. Check cross-device behavior and audit events. Keep alerting, backup/restore checks, pending
   receipt reconciliation, and release signing/key custody in the operational acceptance gate.

Do not enable backend-only enforcement first: existing APKs would lose receipt write access.
Rollback must be deliberate. Reopening direct writes restores legacy access but also restores
the race and incomplete audit coverage. Keep immutable audit events and pending receipt IDs.

Client deletion retains its existing behavior pending a separate retention and coordinated
deletion design. When backend-only enforcement is enabled, the old batched client deletion
path is deliberately denied while deleting receipts; it cannot bypass the new financial
boundary. Resolve that workflow before enforcement if deletion is operationally required.

No deployment, feature-flag activation, or production data migration is performed by local builds.
