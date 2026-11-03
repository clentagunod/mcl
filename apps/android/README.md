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

## Connection and notification states

Sign-in, account verification, administrator and collector screens show a connection alert only while offline. Normal connectivity, background syncing and reconnection have no badges or success banners. Android delivers validated default-network changes to the local page; browser previews fall back to online/offline events. Actual loading, action errors and server-confirmed payment results remain visible where needed.

Offline forms retain their current entries. Sign-in and payment submission wait for a connection; shared administrator forms are guarded against offline submission in the Android shell/dialogs. Reconnection silently refreshes the signed-in user's existing feeds from the server after rechecking their profile. Duplicate native/browser events are coalesced and overlapping refreshes are serialized. Routes and forms stay mounted. Reconnection never automatically signs in, submits a form, replays a payment or replaces a reserved receipt. The verification screen offers a return-to-sign-in action while access remains unconfirmed.

From mobile/, start the local fixture server with `node ../../web/node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4194 --strictPort`, then run `npm run test:status` in another terminal. The browser check uses test contexts, blocks external HTTPS, covers both roles and network signal sources, checks retained drafts and loading/error states, and captures responsive screenshots under ../.tmp. It requires the existing Microsoft Edge/Playwright setup.

## Validation

Android build: .\gradlew.bat :app:assembleDebug :app:testDebugUnitTest

Mobile typecheck/build: npm run build from mobile/.

Receipt tests: node ../../web/node_modules/vitest/vitest.mjs run tests/payments.test.ts --config vite.config.mts from mobile/.

Automated tests do not authenticate against production or write customer data. Live role and data workflows still need the Firebase test-project acceptance checks described in DEPLOYMENT.md.
