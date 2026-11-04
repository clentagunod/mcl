# Receipts on Firebase Spark

The website writes to Firestore directly. Cloud Functions, a Blaze upgrade, and a receipt
backend feature flag are not required. `VITE_RECEIPT_BACKEND` and the old
`settings/Configurations/elements/receiptPolicy.backendOnly` setting are ignored.
The retained functions source is optional legacy code and is not part of web deployment.

## Saving and correcting receipts

The web form reserves a receipt ID and exact payload in local storage before writing.
A failed or uncertain acknowledgement leaves the same receipt available for retry, even
after a reload. A Firestore transaction checks whether that ID already exists: matching
contents succeed without another write, while a conflicting payload is rejected.

Admins/developers can delete a current-cycle receipt for correction. The transaction checks
the displayed receipt against the current document and writes an immutable
`receiptDeletions/{receiptId}` marker containing the original payment, actor, and server
timestamp alongside the deletion. A delayed retry of that receipt never resurrects it.
Rules require both changes together. Legacy `receiptAudit` events remain read-only.

Collectors can only create payments under their own profile attribution. Rules validate
money, dates, daily-minimum policy, and the client's current loan cycle. Closed-cycle
receipts remain immutable through ordinary payment controls. Purging a client from Trash
can remove their remaining receipts; audit events and deletion markers are retained.

## Limits

Balance and renewal-eligibility calculations run in the website. Firestore rules cannot
sum arbitrary receipt queries. Browser transactions track the documents they read, but
cannot lock queries against new matching receipts from another device. This setup does
not guarantee global overpayment prevention for simultaneous web/Android writers.
Firestore Spark usage quotas still apply. Android source and payment document fields
are unchanged; renewed clients still require compatible loan-cycle handling.

## Verify and deploy

From `apps/web`:

```powershell
npm.cmd test
npm.cmd run test:spark
npx.cmd playwright test tests/receipt-retry.e2e.ts
npm.cmd run build
npx.cmd firebase-tools deploy --only "firestore:rules,hosting" --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

The tests use the demo emulator or synthetic browser fixtures. Deployment is separate;
local builds do not alter production data, hosting, rules, or billing.
