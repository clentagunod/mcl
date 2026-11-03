# Android renewal integration

Only apps/android was modified. Read the current apps/web/docs/renewals.md and apps/web/firestore.rules as the authoritative server contract.

The launcher is an APK-bundled React/WebView workspace. It imports the existing web types, converters, calendar and loan calculations. Android normalizes missing client activeLoanId and receipt loanId to initial and missing renewalCount to zero. The legacy Kotlin repository/model path is also cycle-aware, but remains unused by the launcher.

Client subscriptions refresh transaction number, principal, interest, daily amount, term and approval date together after renewal. Shared summarizeLoan and indexEntries filter both client ID and loan cycle; historical receipts stay available and are labeled with their loan ID. Schedules restart at the new approval date and retain Sunday/holiday rules.

Payment entry captures the cycle once. Pending local-storage receipts keep their original cycle; old untagged queued receipts mean initial, even if reopened against a renewed client. Server transactions read the latest client/profile/policy, check the captured cycle and validate the amount/date against current terms. A cycle change asks the collector to reopen the form. A server-confirmed existing receipt returns success without writing another receipt, including when its original loan has since closed. Receipt ID and payload remain reserved for transport, permission or unknown errors. Only definitive local validation rejections release the reservation; no old payment is assigned a new cycle.

The optional daily minimum is checked again inside the transaction. Disabled means informational; enabled requires at least the saved daily amount (or the existing rounded-up fallback). A remaining balance below that minimum directs the collector to an administrator. Failed reads abort submission.

The latest web rules require saved corrections to be admin-only and closed-cycle receipts to be immutable. Android now shows collectors read-only payment history; only admins can correct current receipts. No renewal action or private renewal-history subscription was added. The older file named firestore.collector-edits.rules is now an exact compatibility copy of the current web rules, superseding earlier Android deployment instructions that allowed collector edits or extra template reads. Do not deploy obsolete rules. The web's existing deployment owns renewal backend/rules activation; this work deployed nothing.

## Validation

From mobile:
- node ../../web/node_modules/vitest/vitest.mjs run tests/payments.test.ts tests/renewals.test.ts --config vite.config.mts

From apps/android:
- .\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
- With Android Studio JDK on PATH and FIREBASE_EMULATORS_PATH pointed at the local emulator cache:
  node ../web/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project demo-mcl-index --config firebase.index-test.json "node mobile/scripts/renewal-rules.mjs"

Tests cover legacy normalization, renewed balances and schedules, same-date cross-cycle receipts, stale and persisted untagged drafts, idempotent retry after renewal, failed server reads, daily minimum changes and settlement handling. Emulator tests verify tagged/untagged/stale writes, approval dates, policy toggles, immutable closed receipts and denied private renewal reads. Tests use demo data only.

## Remaining limits

The pre-transaction payment query does not serialize aggregate balances across different receipt IDs. Strict cross-device overpayment prevention still needs an authoritative balance/backend service. Client/payment feeds continue loading the whole collections for this small-business app. Browser rendering uses standard web template styling for collectors because the latest web rules deny custom template settings; no permissions were broadened.

Before release, verify a real test-project web renewal while a phone payment form is open, and a phone restart with a reserved receipt. This session did not renew live loans or deploy rules/functions.
