# Android mobile workspace deployment

## What changed

The launcher now hosts an APK-bundled React workspace in a restricted HTTPS WebViewAssetLoader origin. It uses the same Firebase web configuration and database as apps/web. There is no hosted website dependency at startup; data still requires internet.

Source lives in mobile/src. Existing website services, types, calculations and administrator pages are imported at build time, rather than copied. Gradle preBuild runs the mobile typecheck and bundle when its inputs change. Keep the apps/web workspace beside apps/android.

Collectors get live client search, payment entry with daily minimum feedback, and zoomable read-only index cards. Administrators get overview, client CRUD, payment corrections/deletion, ledger, collectors, holidays and operational settings. Printables and print layout controls are omitted.

## Rules and manual Firebase deployment

No Firestore rules were changed. Publish apps/web/firestore.rules if those exact rules are not already live. From apps/web:

```powershell
npx.cmd firebase-tools login
npx.cmd firebase-tools deploy --only firestore:rules --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

Alternatively paste apps/web/firestore.rules into Firebase Console → Firestore Database → Rules and publish.

The current rules already permit all implemented operations:
- Active collectors read clients, payments, holidays and only settings/Configurations/elements/paymentPolicy.
- Collector payment creates use only clientId, amount, paymentDate, collectorId, collectorName, createdAt and optional notes. createdAt is a server timestamp.
- Collector client edits and saved receipt updates/deletions remain blocked. The Edit action explains administrator access. Amounts can be changed before saving; an administrator corrects saved amounts/dates through Clients → Index card → Correct.
- Administrators manage records and operational settings.

Index days are derived from chronological paying dates. The collection date defaults to today; choosing an actual collection date determines the index day. Multiple receipts on one date share a day, missed dates leave no gaps, and backdated corrections can renumber later days. No day field or schema migration is introduced. Arbitrary independent day overrides and collector saved edits would require an explicitly revised shared data contract and rules; this build does not weaken the current rules.

No new collections, indexes, Cloud Functions or hosting deployment are required. Firebase CLI authentication was unavailable during implementation, so live database edition/rules could not be inspected or deployed. Use the existing default database and do not provision a replacement.

## Build and install

1. In apps/web, run npm.cmd ci using its existing package-lock.json.
2. Configure apps/web/.env with the existing VITE_FIREBASE_* web app configuration from the same Firebase project. The mobile bundle uses these values; google-services.json alone does not configure its web SDK. Never put service-account credentials in Vite variables.
3. Build in Android Studio, or from apps/android with Android Studio's JDK configured:

```powershell
.\gradlew.bat :app:assembleDebug :app:testDebugUnitTest
```

Debug APK: app/build/outputs/apk/debug/app-debug.apk. Install through Android Studio. For distribution, use Android Studio → Generate Signed App Bundle / APK with your release signing key. Increase versionCode for a published update.

The local HTTPS origin is https://appassets.androidplatform.net. Email/password sign-in uses the Firebase web SDK directly; no OAuth redirect or native JavaScript bridge is used. If your Firebase API key has HTTP referrer restrictions, permit that origin for this registered web app; keep the key restricted to the needed Firebase APIs.

Build commands from apps/android/mobile:

```powershell
npm.cmd run build
node ../../web/node_modules/vitest/vitest.mjs run tests/payments.test.ts --config vite.config.mts
```

## Shared logo

Replace apps/web/public/assets/logo.png with your optimized PNG. It is the single source used by the website and copied into Android's bundle during build. Rebuild Android and redeploy the web build after replacing it. Do not edit generated app/src/main/assets/mobile files. Launcher icons are separate Android mipmap resources and can be updated with Android Studio's Image Asset tool.

## Reliability and acceptance checks

Receipt IDs and their payloads are reserved in local storage before submission. An uncertain network result retains the same receipt for retry, including after restarting the app. Success appears only after a server transaction completes. Explicit validation failures allow corrections before another attempt. Signing out stops subscriptions and clears visible client data; reserved receipts are keyed by user and client.

Outstanding balances use a fresh server query before transaction submission. Existing rules do not serialize total repayment across different collectors; strict global overpayment prevention still requires a trusted transactional backend. Live subscriptions still load all clients/payments for shared calculations, matching the small-business website; pagination limits rendered client cards to 25, not database reads.

Collectors cannot read customized print-template settings under the current rules. Their index card shows loan data and paying dates using mobile branding rather than the website's restricted print styling.

Before production distribution, verify on your Firebase test project: admin and collector login; inactive/revoked profiles; live updates across website and phone; skipped days and same-date receipts; minimum on/off and final settlements; admin corrections; offline uncertain-save retry; rotation, keyboard and hardware Back; index-card zoom. No production credentials or customer writes were used for automated checks.
