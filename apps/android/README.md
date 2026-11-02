# MCL Lending Android

An APK-bundled WebView workspace for collectors and administrators, sharing Firebase and business logic with apps/web.

Collectors can search clients, record payments and view zoomable live index cards. Administrators get mobile overview, client management, payment corrections, ledger, collector management, holidays and operational settings. Printables stay on the website.

The implementation follows the existing apps/web/firestore.rules. Collectors cannot edit saved receipts or client records; administrator corrections update the shared ledger. Index days follow actual paying dates, with no gaps for missed days.

Read [DEPLOYMENT.md](./DEPLOYMENT.md) for Firebase rules publishing, logo placement, build commands, limitations and acceptance checks.

## Development

Install dependencies in apps/web with npm ci and configure its .env Firebase web values. Gradle automatically builds mobile/ into app/src/main/assets/mobile before packaging. Keep apps/web beside this Android workspace.

- mobile/src: mobile role/session handling, collection UI, receipt transactions and responsive styling.
- apps/web/src: shared types, calculations, services and administrator pages imported at build time.
- MainActivity.kt: restricted HTTPS WebViewAssetLoader host with system/keyboard insets and lifecycle handling.
- mobile/tests/payments.test.ts: payment boundary tests with Firebase mocked.
- mobile/scripts/smoke.mjs: login layout smoke check at phone/tablet widths using installed Microsoft Edge (start Vite preview on port 4178 first).

Legacy native collector classes remain in the tree but are no longer the launch experience.

## Validation

Android build: .\gradlew.bat :app:assembleDebug :app:testDebugUnitTest

Mobile typecheck/build: npm run build from mobile/.

Receipt tests: node ../../web/node_modules/vitest/vitest.mjs run tests/payments.test.ts --config vite.config.mts from mobile/.

Automated tests do not authenticate against production or write customer data. Live role and data workflows still need the Firebase test-project acceptance checks described in DEPLOYMENT.md.
