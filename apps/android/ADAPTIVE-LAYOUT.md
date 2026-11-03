# Adaptive Android workspace

The app already used basic responsive web styles. This update extends the existing WebView architecture with window-size-dependent layout; no Compose screen migration or experimental layout dependency was introduced.

- Client cards use a minimum readable width and fill available columns dynamically.
- Compact windows retain a horizontal navigation area. Administrators get a vertical sidebar at 840 CSS pixels and above. The collector's single destination remains horizontal.
- Headers, client actions, receipt rows, pagination and zoom controls wrap rather than overflowing.
- Forms use the available container width; narrow windows use a single column.
- Dialogs remain bounded by the visible WebView. Short windows get tighter padding and a smaller card-preview viewport with scrolling.
- Android's Activity is explicitly resizable. The existing WebView resize/configuration handling remains in place.
- CSS changes presentation without changing React component identity, keeping search and active payment drafts intact during live window resizing.

Verification uses actual Shell, Clients and PaymentDialog components with test-only in-memory contexts and no submitted payments. The production-bundle browser fixture tests 320, 360, 600, 840 and 1280px widths plus a 720x360 landscape window. It repeatedly resizes a populated payment form and checks draft retention, reachable Save controls, role-specific navigation and absence of document overflow. Screenshots are written to .tmp/adaptive-WIDTHxHEIGHT.png.

Build and test:
- Android Studio: :app:assembleDebug :app:testDebugUnitTest
- From mobile: node ../../web/node_modules/vite/bin/vite.js build --config tests/adaptive.vite.mts
- Serve that fixture with: node ../../web/node_modules/vite/bin/vite.js preview --config tests/adaptive.vite.mts --host 127.0.0.1 --port 4181 --strictPort
- Run: node scripts/adaptive-check.mjs

Browser size tests simulate available window sizes; they do not certify physical hinge occlusion or platform-specific folding postures. Verify rotation, split screen, keyboard resizing and unfolded behavior on target Android devices before release. No Firebase changes or deployment are required.
