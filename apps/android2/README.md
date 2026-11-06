# MCL Lending Android

Native Kotlin, Jetpack Compose and Material 3 workspace for administrators, developers and collectors. See [FEATURE-PARITY-PLAN.md](./FEATURE-PARITY-PLAN.md) for the feature inventory.

The app includes Dashboard charts and statistics, client management and renewal, payment collection/history/corrections, consolidation, team accounts, holidays, shared settings, Trash and Print Studio. Navigation uses type-safe Compose routes and WindowSizeClass: bottom navigation on phones and a rail on wider windows. Administrator/developer management access and the restricted collector workspace follow the existing profiles and permissions.

Print Studio includes index cards, promissory notes and daily summaries, native print/Save as PDF, HTML, Word and ZIP exports. Document rendering uses a restricted WebView; the application screens are native Compose.

## Build

Open this directory in Android Studio. Use the configured Gradle JVM/toolchain 25, Android SDK 37 and checked-in wrapper. The app supports API 24 and later; Java source compatibility is 17.

From this directory in PowerShell:

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
.\gradlew.bat :app:lintDebug
```

Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.

Keep `../web` beside this project: Gradle copies its MCL logo, supplied promissory HTML/DOCX templates and print CSS. The native Android build does not run npm or package the former mobile React workspace.

## Firebase

This workspace already contains `app/google-services.json` for project `mcldb-143d3` and application `com.mcl.mcllendingapp`. On another checkout where that ignored file is absent, obtain the matching Android configuration from Firebase and place it at that path, or use **Import Firebase configuration** on the sign-in screen.

Use the current [direct payment rules](./receipt-rollout/firestore.rules). The Android app needs no receiptControl or loanBalances setup; previously created documents are ignored. If you deployed the earlier ledger rules, replace them with this ruleset once.

Sign in with an existing Firebase email/password account and active user profile. Configuration does not grant database access: deployed rules and authenticated profiles remain authoritative. The default native implementation uses Firebase Auth and Firestore directly; no Cloud Functions deployment is configured by default. Building the app does not deploy rules, functions or production data migrations.

## Cache and receipt recovery

Room holds the account-scoped offline cache and reserved receipt attempts. Synchronization reads bounded Firestore cursor pages into a staging snapshot, then atomically publishes the completed snapshot to Room. Failed refreshes retain the last completed cache. Foreground feeds stop when the app is no longer visible; WorkManager requests authorized refreshes when connected.

Cached financial information is identified as awaiting live confirmation. Financial changes perform server checks. Background refresh does not automatically submit reserved receipts. Retrying an uncertain receipt preserves its original identifier and payload.

The upgrade reads pending receipts from the former interface's local storage for the signed-in account and imports them into native recovery. Preserve installed WebView storage, Room data and pending receipts until reconciliation. Removing obsolete source assets does not require clearing installed application data.

Receipt identifiers are idempotent and submissions check current authorization and loan-cycle data. Outstanding balance is still read before the receipt transaction; different receipt identifiers do not serialize through a shared per-loan balance write. Simultaneous receipts or corrections can pass the same pre-read balance. Strict concurrency enforcement requires a coordinated trusted-backend/rules/web change and reconciliation of existing receipts. Atomic Room snapshot publication does not replace that server-side invariant.

## Verification

See [VERIFICATION-2026-11-05.md](./VERIFICATION-2026-11-05.md) for the latest fixes, test evidence and remaining acceptance work.

Run Room instrumentation tests with `.\gradlew.bat :app:connectedDebugAndroidTest` on an emulator or device. Use an isolated Firebase test project for authenticated role, renewal, retry, printing and simultaneous-write acceptance checks.

The `baselineprofile` module provides startup/navigation capture infrastructure for a connected API 28+ device. Profile capture remains pending; generation is explicit rather than automatic during ordinary builds. Record the intended authenticated test paths before generating and packaging the release profile.

Local tests and fixture checks do not establish production authorization, deployed backend behavior or physical printing correctness. Historical deployment, adaptive-layout, renewal and audit documents describe earlier implementations; their WebView/npm build instructions are superseded by this README.
