# Web interface

The web workspace uses the existing MCL blue accent with shared light and dark
surfaces. Base tokens, controls, navigation, focus states, and reduced-motion rules
live in `src/index.css`. Page-specific styles live beside their respective pages.
Printed documents keep their own white-paper styles independently of the web theme.

The sun/moon control in the top bar and sign-in page stores the chosen theme under
`mcl:preferences:theme` in browser local storage. It follows the system theme until a
preference is chosen and synchronizes changes across tabs. If storage is blocked,
theme switching still works for the current session. This preference is local to
the browser and does not change shared Firestore settings.

The dashboard trend aggregates receipts by payment date, fills missing calendar days
with zero, and provides 7-, 14-, and 30-day views. Arrow keys, Home, and End inspect
individual dates. Financial cards explain the meaning of their totals; the loan
status chart also presents counts in text.

The desktop client directory groups related loan fields in a fixed-height card.
The rows scroll inside the card while the column headings, selection controls, and
pagination remain available. Narrow screens use horizontal scrolling inside the
table. Full addresses open in a dialog. Account lists have independent search,
role/status filters, and 10-, 25-, or 50-row pagination.

Printables separates document selection, client/layout preparation, and preview or
output. The holiday calendar fills the existing holiday form without saving until
the user submits it. Settings has direct section links such as
`/settings#settings-trash`. Trash retains the existing restore and confirmed deletion
workflows and displays the saved retention policy.

Run from `apps/web`:

```powershell
npm.cmd test
npm.cmd run build
npx.cmd playwright test
```

Browser tests use synthetic fixtures and block Firebase network requests. The full
workspace fixture renders the production shell and page views with synthetic
contexts. No Android code is involved in these interface changes.
