# Native Android verification — 2026-11-05

Scope: the `android2` native application. Existing unrelated monorepo changes were preserved.

## Latest change: restore direct payment compatibility

Removed the mandatory receiptControl and loanBalances dependency from payment
reservation/submission/deletion, client allocation/editing, renewal and Trash.
Existing receipts remain authoritative for the app's balance checks. Reserved IDs,
payload comparisons and deletion markers preserve receipt retry recovery.

Current rules: receipt-rollout/firestore.rules, also synchronized to
firestore.collector-edits.rules. These replace the former ledger-v1 rules and retain
the existing web document model. No production rules or data were changed.

Current validation: debug unit tests, debug APK assembly and debug lint passed.
All 14 direct Firestore compatibility tests passed on the isolated Standard demo
emulator, covering existing paid history with no setup documents, ignored old gate
state, retries, correction/deletion, role and receipt validation, client creation,
financial editing, renewal, Trash/restore and legacy cycles. These JavaScript SDK
contract tests mirror native Firestore reads/writes; APK-to-production acceptance
was not run. Earlier release/instrumentation results below are historical.

Different receipt IDs still do not share a server-side balance write. This restores
the original direct-write behavior without claiming strict cross-device overpayment
protection. The retired staged web writers and bootstrap are not part of this release.

## Fixes

- Renewal history loads into a private staging owner and publishes all pages and its sync marker in one Room transaction. Interrupted refreshes retain the previous complete history; refresh errors allow cached history to render. Account-scoped cleanup removes abandoned renewal stages after process death while preserving published history and recovery records.
- Invalid loan terms fail before daily-payment arithmetic.
- Client, payment and renewal draft strings survive SavedStateHandle recreation. Client edits retain the original revision/cycle for conflict detection; write permission and renewal confirmation must be obtained again.
- Initial client/renewal loads cannot overwrite edits made through enabled controls. An unavailable existing client cannot fall through to creation of a new borrower.
- Receipt recovery offers a return to sign-in. Successful receipt retries clear payment entry fields.
- Archived receipt screens identify the requested loan and omit the current loan's financial summary.
- Print option changes immediately invalidate export/preview readiness. Old WebView callbacks cannot approve a newer preview. Exports capture the selected request at tap time and reject duplicate taps.
- Pre-paginated summaries retain their page numbers and rows. Layout estimates account for transaction/date wrapping.
- ZIP document entries have unique ordinal names; invalid document kinds/formats fail before snapshot creation.
- Print search rescans on cache updates even when the first backing row and total remain unchanged.
- Gradle prints full failed-test exceptions for reproducible diagnostics.
- Updated the instrumentation stack to Espresso 3.7.0, AndroidX JUnit 1.3.0 and Runner 1.7.0. The old Espresso injector failed on Android 17 before UI assertions; the updated stack passes all four sign-in cases.

## Existing testing setup

The app uses Hilt, JUnit4 and kotlinx-coroutines-test, with hand-written fakes/proxies for domain interfaces. UI is Jetpack Compose. Compose instrumentation tests use the existing AndroidJUnitRunner and Compose test rule. Room instrumentation tests use an in-memory database; document tests load the packaged assets. These tests require no authenticated Firebase session and do not write production data.

No mocking library, Robolectric, screenshot framework or coverage plugin was added. Verification extends the current test stack.

## Verification evidence

| Check | Result |
| --- | --- |
| Debug app and instrumentation APK assembly | Passed; final debug APK deployed through Android Studio. |
| Local unit tests | 39 passed, including the off-page print-search regression. |
| Room, document and sign-in UI instrumentation | 14 passed, 0 failed, 0 ignored on Medium Phone, Android 17 / API 37. Includes abandoned-stage isolation and preservation of pending receipts. |
| Startup smoke check | Native sign-in rendered; appearance chooser opened and closed. No app crash observed. |
| Android lint | Passed on the final source, including Android test inspections. |
| Optimized release assembly | Passed on the final source with R8 and resource shrinking. Unsigned release APK built; signed-release installation was not tested. |
| Live Firebase acceptance | Not run; no isolated authenticated test setup supplied. |
| Physical printing / Word pagination | Not tested. |

The first PrintablesViewModel regression run exposed test teardown ordering: resetting Main before cancellation completed caused two failures. The collector is now canceled and Main work drained before reset; the full unit suite passed. AndroidX Test versions were checked with Android Studio's Maven version lookup and the [official test setup guide](https://developer.android.com/training/testing/instrumented-tests/androidx-test-libraries/test-setup).

The normal emulator boot timed out; a cold headless boot succeeded. A System UI timeout overlay appeared during startup smoke testing and was dismissed; the app then responded normally. This is not a performance benchmark. A combined build/test run was interrupted after progress stopped. Final validation used two Gradle workers: unit and Android tests completed together, then release assembly and lint completed with the emulator stopped.

## Reproduce

Use the configured Gradle toolchain 25, Android SDK 37 and wrapper from this directory:

```powershell
.\gradlew.bat :app:testDebugUnitTest --max-workers=2
.\gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest --max-workers=2
.\gradlew.bat :app:lintDebug --max-workers=2
.\gradlew.bat :app:assembleRelease --max-workers=2
.\gradlew.bat :app:connectedDebugAndroidTest --max-workers=2
```

If Java is absent from PATH, use Android Studio's configured runtime as JAVA_HOME for the wrapper launcher. The daemon toolchain remains controlled by `gradle/gradle-daemon-jvm.properties`.

## Remaining acceptance work

Local checks do not establish live Firebase permissions or the behavior of every existing writer. Verify administrator/developer/collector profiles, revocation, stale records, receipt recovery, renewal and offline transitions against an isolated Firebase project.

Distinct receipt identifiers still read outstanding balance before their transactions and do not share a server-enforced per-loan balance write. Simultaneous receipts/corrections and other writers require coordinated backend/rules/web enforcement and reconciliation. No rules, backend functions, policy gates or production data were deployed or migrated.

Check physical output, DOCX reflow, large production datasets, tablet/foldable/keyboard behavior and accessibility before release. Baseline Profile capture remains pending.
