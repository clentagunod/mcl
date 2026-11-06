# Current Android payment compatibility

The current Android app uses existing clients and payment history directly.
It does not read or write receiptControl or loanBalances. There are no control
documents, per-client balance documents or bootstrap steps to create.

The former ledger-v1 rollout in this directory is retired. The files under
web/, bootstrap tooling, ledger.rules.test.mjs, web.integration.test.mjs and
bootstrap.integration.test.mjs are historical proposals. Do not copy or run those
files for the current app. Existing web sources already use direct receipts and
do not need those replacements.

## Install the fix

1. Publish the COMPLETE contents of [firestore.rules](./firestore.rules) in
   Firebase Console → Firestore Database → Rules for the app's project.
   This is the direct compatibility ruleset, replacing the earlier ledger-v1 rules.
   The copy at ../firestore.collector-edits.rules is identical.
2. Install app/build/outputs/apk/debug/app-debug.apk from the android2 directory,
   or run the updated app from Android Studio.
3. Refresh, reopen Payments and save the payment.

Publishing rules is still required if the previous rules demanded a ledger.
An APK cannot override deployed rules. No production data or rules are changed
by building the app or by the verification command.

Keep existing clients, receipts, local app data and reserved receipt attempts.
Previously created control/balance documents are ignored; there is no need to
delete anything. Retry an uncertain receipt using its existing ID.

## Behavior and verification

The rules preserve active role checks, collector ownership and daily minimum,
valid receipt amounts/dates, server timestamps, current loan cycles, immutable
deletion records, administrator corrections, client renewal history, and Trash.
Collectors can read a missing deletion marker or their own marker for retry
recovery; they cannot list markers or read another collector's marker.

The Android app calculates the current outstanding balance from existing receipts
before submitting. The receipt transaction checks authorization, loan terms, the
reserved ID and deletion marker again. Different receipt IDs do not serialize
through a shared balance. This restores the existing web workflow; it does not
provide strict server-side prevention of concurrent overpayments across devices.

Run from android2:

```powershell
node receipt-rollout/verify.mjs
```

Verified on 2026-11-05: all 14 direct compatibility checks passed. Android debug
unit tests, APK assembly and lint also passed. Production permissions were not tested.

This verifies direct receipt compatibility in an isolated Standard Firestore demo
emulator. The contract tests mirror the Android reads/writes using the JavaScript
SDK; they are not APK/device tests. The historical ledger suites are not run.
