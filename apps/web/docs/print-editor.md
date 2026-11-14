# Print Studio editor

Print Studio uses a Word-style document workspace with document tabs, a Home/Layout/Insert/View ribbon, client selection, a paper canvas, page navigation and a picture inspector. All three printables use this workspace. The ribbon exposes document-specific controls: index-card typography and client editing, promissory-note text alignment and pictures, and daily-summary collection date and line spacing.

## Daily Summary Sheet clients

Settings → Daily Summary Sheet → **Only show clients with payments** defaults to On, including workspaces without a saved value. It is saved as `onlyClientsWithPayments` in `settings/Printables/elements/summaryTemplate`, with the existing settings metadata and conflict protection. Turning it Off includes clients without payments again. Live settings subscriptions update open studio tabs after a confirmed save.

The filter matches positive receipts by `paymentDate` against the collection date (today by default), across collectors and loan cycles. It filters the client picker and the shared preview/export renderer before pagination, retaining the existing client selection and receipt totals. All preview, print/PDF, DOCX and HTML output follows the same setting. Dates without matching payments show an empty state and disable output rather than producing a blank page. This setting does not filter client records, payments, other printable documents or financial reports.

## Opening the separate studio

`/printables` is an introduction page inside the main website. Its **Go to another page for printing** link opens the protected `/print-studio` route in a separate tab. The main website remains navigable while the studio retains its local draft. Launchers preserve an optional `client` query parameter, and Clients → Print opens that client's studio directly. Native `target="_blank"` / `rel="noopener noreferrer"` links keep the browsing contexts independent. Studio links to main-site/template settings pages also open separately.

The standalone route uses the same `RequireAdmin`, settings and data providers as the website, without rendering the main navigation shell or starting expense subscriptions. Existing Firebase Auth browser persistence shares the login across same-origin tabs. Signing out in either tab updates all observers; the guard unmounts printing content and feeds, clears in-memory uploads/history and redirects the tab to sign-in with a session-ended explanation. It does not try to close the browser window. A later sign-in can return to the requested studio route, with a fresh draft. No custom cross-tab token transport, logout Firestore document, new storage fields or persistence-mode change is used.

## Fullscreen navigation

The studio fills the viewport with its toolbar and page/zoom bar always visible. Only the canvas, client results and picture controls scroll inside their allotted areas. Documents start and reset at 75% zoom with canvas scrolling enabled. Fit page and Fit width are explicit optional choices; choosing a manual zoom exits automatic fitting. Collapse the ribbon to enlarge the canvas while retaining output controls. The introduction keeps only the short explanation and launch action, without document-description or session-information cards.

Client and picture toggles sit above the document. Below 1,100 px, those panels become mutually exclusive dismissible drawers and start closed, avoiding long vertically stacked forms. The fullscreen inspector has a compact picture selector and Position / Appearance tabs. Notifications have a dismiss action. Embedded previews retain the regular inspector. View Only continues to hide all editing/output actions while preserving inspection navigation.

Each document type has its own session draft, undo/redo history, paper/font/presentation overrides and view options. Reset print options affects the current document and can be undone. These tools are held in React memory; they are not Firestore settings and are not written to browser storage. Existing Template settings and client-edit dialogs retain their explicit persistent save behavior.

## Pictures and signatures

For a promissory note, select the client and person in the Pictures panel and choose Upload ID image or Upload e-signature. ID upload is shown only when the saved ID-page setting and the current print job's attachment are enabled; the handler enforces the same gate, including after asynchronous image decoding. A local override cannot enable a page disabled in saved settings, and uploading no longer enables it automatically. ID insertion fits the image into the corresponding saved box. Signatures remain available independently and begin over the corresponding signature row on the note. The canvas navigates to the inserted image's page. Disabling the saved setting live excludes ID/attachment artwork from the editor and output.

Drag an image, resize with its corner handles, or turn it with the round handle. Picture format provides precise physical position/size/rotation, aspect ratio, opacity, quarter turns, flips, duplicate, layer order, placement, lock and remove. Arrow keys nudge 1 mm; Shift + arrow nudges 10 mm. Delete removes the selected picture, Escape clears selection, and Ctrl/Cmd+Z / redo works inside the canvas. Each gesture is one undo step.

Images belong to an immutable client document ID and a note/attachment page. Bulk output never shares images between clients. Deselecting a client retains their local draft while excluding it from output. Disabling an attachment that still owns images blocks output with an actionable message.

PNG/JPEG/WebP files are decoded locally, metadata stripped and normalized to PNG with transparency preserved. Files must be at most 10 MB and 25 million decoded source pixels. Retained images have a maximum 2,400-pixel longest side. There are at most 40 pictures per current draft. No Firebase Storage upload or Firestore image field is used. Reloading or leaving Print Studio clears all uploads and drafts; user-requested output files contain their embedded images.

## Rendering and exports

`PrintJob` has optional session `presentation` and `images`, separate from shared `AppSettings`. Browser/HTML rendering places normalized images in absolute physical millimetres on their owning page. `boundImage` keeps the complete rotated rectangle on the page. Page setup changes constrain images to the new dimensions. Actual content is measured after fonts/images load, and overflowing paper remains blocked for printing.

Print/PDF and standalone HTML include image transforms. Native Word output embeds PNG media with page anchors, physical positions, exact extents, rotations, flips and alpha, including attachments and client-specific ZIP members. Typography and logo choices also carry through. Word may reflow text; PDF preserves the preview layout. Selection outlines, handles and editor chrome are excluded from output.

View Only hides output/edit tools and removes manipulation handles while preserving the current preview. Returning to Printing Mode retains the draft. Ruler, grid, fit-width, actual size, zoom and page navigation affect the workspace only.

The editor does not change Firestore rules or schemas. Android parity instructions are at the top of `apps/android/context.md`. Unit tests cover geometry, safe image sources, client/page ownership, Word media/anchors and isolated defaults. `tests/print-editor.e2e.ts` covers session isolation, real pointer and keyboard editing, exports, reload clearing, network/storage boundaries, bulk ownership and invalid uploads; existing print, ID-page and client-edit tests remain active.

`npm run test:printing-session` adds end-to-end coverage against actual Firebase Auth and Firestore emulators, using a demo-only configuration. It launches its own Vite server and verifies the native authentication synchronization across main/studio tabs, logout cleanup and fresh reauthentication, protected direct links, selected-client launch behavior, fullscreen fitting and mobile drawers. These tests are skipped by ordinary Playwright runs without the emulator environment. Production does not import the isolated Firebase fixture.
