# MCL native Android: feature parity checklist and implementation plan

Updated 4 November 2026. Status: native implementation is in place; final verification is ongoing.

This document records the web inventory and its implemented native adaptations. Checked items mean implemented and source-reviewed, including mobile equivalents for desktop controls; they do not mean live Firebase, device, printing or release acceptance has passed. The owner authorized implementation of all features after the analysis checkpoint. Verification evidence and pending checks are recorded below; no production backend deployment or customer-data migration was performed.

## Confirmed context

- Web source: ../web, React + Vite + TypeScript. Source of truth: current files, particularly [App.tsx](../web/src/App.tsx), [Layout.tsx](../web/src/components/Layout.tsx), feature pages, services and rules.
- Purpose: MCL Lending administration and collection management.
- Backend: Firebase email/password Auth and Firestore, default database selected by current web initialization. Current receipt path uses direct Firestore writes; the optional receipt Cloud Functions branch is explicitly disabled.
- Existing Android package/application ID: com.mcl.mcllendingapp. Minimum SDK 24; compile/target SDK 37 in current build.
- MainActivity now launches native Compose navigation and role-specific workspaces. Printables and Trash are included. The retired React mobile workspace, packaged mobile bundle and unused legacy collector classes/tests/resources have been removed.
- A valid ignored app/google-services.json was discovered for project mcldb-143d3 and Android application com.mcl.mcllendingapp. The initial indexed search missed this ignored file. Native configuration import remains available for checkouts where the file is absent.
- The existing Firebase project/default database is reused. Live database edition, deployed rules/indexes and production account behavior remain acceptance checks; no new database, default Cloud Functions deployment or backend schema migration was introduced.

## Mobile screen map

Phones use Dashboard / Clients / Printables / Ledger / More as five bottom destinations. More contains Collectors & Admins, Holidays, Settings, Trash, account information, theme and Sign out. All eight protected web pages remain reachable. Each primary destination retains its own navigation and list state.

| Web destination | Implemented mobile adaptation |
| --- | --- |
| /login | Branded email/password screen with theme control, inline errors and access-verification state. |
| / | Scrollable Dashboard: KPI pairs, interactive charts, recent receipts, due clients and collector cards. |
| /clients | Searchable paged cards, status chips, list options, contextual multiselect; client detail opens full loan/contact information and actions. |
| /clients forms/actions | Full-screen borrower editor, Payments screen/add-payment sheet, renewal review form, renewal-history timeline, address sheet and confirmations. |
| /printables | Document and mode selectors, client selection/options, physical-page preview, output actions. Paper controls in a sheet; full-screen preview on phones. |
| /liquidation | Filtered summary and searchable paged client cards; ledger sheet has client fields, all 58 numbered slots, totals and paginated paying-date history beyond day 58. |
| /collectors | Searchable paged account cards and role/status chips; per-account actions, confirmations and full-screen create/edit forms. |
| /holidays | Summary, month calendar, searchable saved-date cards and add/update editor. |
| /settings | Six section links opening editors with one shared staged draft and persistent Save/Discard state. |
| /trash | Retention summary, search/status chips, selectable paged cards, restore/purge confirmations and interrupted-deletion recovery. |

WindowSizeClass switches bottom navigation to a rail on wider windows; responsive content bounds and wider-screen chart/preview arrangements supplement the phone layout. Forms use keyboard-safe scrolling and inline validation. ViewModels, navigation state and saveable UI state provide configuration-change retention; rotation/process-restoration and detailed phone/tablet visual acceptance remain part of final verification.

## Feature parity checklist

### A. Application shell, authentication and authorization

Sources: [App.tsx](../web/src/App.tsx), [Layout.tsx](../web/src/components/Layout.tsx), [LoginPage.tsx](../web/src/pages/LoginPage.tsx), [admin-session.ts](../web/src/services/admin-session.ts), [roles.ts](../web/src/lib/roles.ts), [firestore.rules](../web/firestore.rules).

- [x] A01 Logo, configurable workspace/business name, lending-workspace wording, current page identity, business date, account name/initials/role and footer identity adapted to native app chrome.
- [x] A02 All menu destinations: Dashboard, Clients, Printables, Consolidation, Collectors & Admins, Holidays, Settings, Trash; preserve links between feature pages and settings sections.
- [x] A03 Email/password login, trimmed email, disabled empty/busy submission, loading/access verification, useful authentication/access errors, signed-in redirect, Sign out with busy/error handling.
- [x] A04 Live server-confirmed profile authorization; deactivation, missing profile, unsupported role, listener failure and account change close privileged access. Late responses cannot reopen an old session.
- [x] A05 System-following initial theme and persistent explicit light/dark toggle on login and inside workspace.
- [x] A06 Route protection, safe fallback for unknown routes, back navigation, accessible focus/labels and keyboard support where relevant.
- [x] A07 Initial loading, no cached records, visible offline/error/freshness states; settings-sync and trash-cleanup failures; retry/reload guidance. Malformed records cannot silently produce trustworthy totals.
- [x] A08 Preserve existing Android collector capability while replacing its UI: client search, own-receipt creation, payment history and index-card viewing, with admin-only actions hidden and denied.

| Operation | Active admin | Active developer | Active collector |
| --- | --- | --- | --- |
| All protected web/admin destinations | Yes | Yes | No |
| Read clients/payments/holidays | Yes | Yes | Yes |
| Create own receipt | Yes; minimum exemption | Yes; minimum exemption | Yes; per-receipt minimum when enabled |
| Change client, renew, trash/restore/purge | Yes | Yes | No |
| Delete current-cycle receipt | Yes | Yes | No |
| Read private renewal history | Yes | Yes | No |
| Manage admin/collector accounts | Yes; self safeguards | Yes; self safeguards | No |
| Read/write private settings | Yes | Yes | No |
| Read payment-policy document | Yes | Yes | Yes |
| List/create/edit developer accounts | No | No | No |

Inactive/unknown roles cannot enter a workspace. Developer profiles remain private except for the owner's session check. Collector visibility is not assignment-based; do not invent assignments or narrow existing visibility.

### B. Dashboard

Sources: [DashboardPage.tsx](../web/src/pages/DashboardPage.tsx), [DashboardCharts.tsx](../web/src/components/DashboardCharts.tsx), [stats.ts](../web/src/lib/stats.ts).

- [x] B01 Business date, live/awaiting-confirmation indicator, View clients action and explanatory KPI information.
- [x] B02 Collected today; collected this month; outstanding principal plus fixed interest on current loans; principal released across current client records. Exclude Trash from active reports.
- [x] B03 Collection trend: 7/14/30 calendar days, default 14, zero days included; period total, receipt count, selected date/amount, Today label, date/peso axes and empty state. Group by collection date, not entry timestamp.
- [x] B04 Inspect bars by tap and accessible descriptions; support hardware-keyboard left/right/Home/End equivalents.
- [x] B05 Due/Pending/Paid donut with total clients, counts, rounded percentages, contextual message and Clients link.
- [x] B06 Recent payments with configured limit: client name or Deleted client, collector, collection date, entered time and amount; newest entry first with existing fallback/tie behavior.
- [x] B07 Due clients with configured limit: name, due date, outstanding, status; highest outstanding first; total count, showing-X-of-Y and Clients link.
- [x] B08 Collector activity today: avatar/name, receipt count, amount, latest entry, alphabetical order, manage-accounts link. Include admin/removed-account actors represented by today's receipts.
- [x] B09 Initial loading, whole-screen error/freshness feedback and each section's empty state.

### C. Clients and borrower forms

Sources: [ClientsPage.tsx](../web/src/pages/clients/ClientsPage.tsx), [ClientFormModal.tsx](../web/src/pages/clients/ClientFormModal.tsx), [clients.ts](../web/src/services/clients.ts), [validation.ts](../web/src/lib/validation.ts).

- [x] C01 Card/detail fields cover every table column: full formatted name, cellphone, full-address action, public client ID, current transaction, renewal count/history, principal, fixed interest, outstanding, daily payable, due date, approval date, elapsed collection days/term and Due/Pending/Paid.
- [x] C02 Case-insensitive substring search of first/middle/last names, cellphone, address, public ID and transaction. All/Due/Pending/Paid chips. Preserve default Due then Pending then Paid, name and ID ordering.
- [x] C03 Page sizes 10/25/50/100; range/count; first/previous/number/next/last navigation, ellipses and clamping after live changes. Compact list-options/page-jump UI may replace desktop controls.
- [x] C04 Individual/page checkboxes and mixed state; select all matches across pages; selected count and Clear. Persist across page navigation, clear when search/status changes, remove deleted selections.
- [x] C05 Add client, Trash navigation, bulk Move to Trash; per-client Print with preselection, Payments, Edit, Move to Trash, eligible Renew and Renewal history. Mutation availability follows feed/access readiness.
- [x] C06 Add/Edit: last/first/optional middle name, cellphone, permanent address, principal, fixed interest, 45/50/58-day term, approval date, saved daily payable, Use suggested daily amount, total preview, Cancel/Save/busy/error. Editing displays identifiers.
- [x] C07 Clean name/address whitespace; require first/last/address; Philippine cellphone 09xxxxxxxxx or +639xxxxxxxxx after accepted punctuation removal. Principal/daily >0, interest >=0, supported term, valid calendar date and bounded centavo money. Retain actual saved daily agreement rather than recalculate on read.
- [x] C08 Configurable public ID allocation and unique five-digit transaction reservation; atomic counters/reservations, skip occupied IDs, preserve legacy document/payment references and stable zero-padded strings.
- [x] C09 Transactional stale-edit rejection against opening loan ID/revision/terms; show reload/reopen guidance rather than overwrite another session's edit or renewal.
- [x] C10 Loading, no clients, no matches, settings-unavailable allocation, invalid-record and operation errors.

### D. Payments and receipt recovery

Source: [PaymentsModal.tsx](../web/src/pages/clients/PaymentsModal.tsx), [payments.ts](../web/src/services/payments.ts), [pending-receipt.ts](../web/src/lib/pending-receipt.ts).

- [x] D01 Client/current transaction/daily amount header; principal, fixed interest, paid, outstanding, due date and status summary; paid/no-receipts states.
- [x] D02 Add payment amount, collection date and optional note (current web input maximum 500), configured default note, submit/busy/error. Receipt data compatibility supports existing notes up to the service/rules bound of 1,500.
- [x] D03 Amount positive and <= outstanding; valid date from approval through Manila business today; current cycle and healthy confirmed data required.
- [x] D04 Collector minimum applies to each receipt when enabled; larger amounts allowed within outstanding. Admin/developer can enter smaller partial/final settlements.
- [x] D05 Reserve/persist exact receipt ID and immutable payload before save. Reopen/restart restores pending entry; editing is locked; Retry same receipt retains ID/payload. Clear only after confirmed success.
- [x] D06 Uncertain acknowledgment, old-cycle pending receipts, malformed/unknown persisted entries and reconciliation guidance; never silently discard or retag an unresolved receipt.
- [x] D07 Current-cycle history: collection date, sequential index day, amount, collector, notes/default and entered timestamp. Newest collection date then entry first; 25/page, count, previous/next.
- [x] D08 Delete receipt with amount/date/resulting-balance confirmation; stale-content/current-cycle checks, atomic immutable deletion tombstone and idempotent retry.
- [x] D09 Archived-cycle history stays read-only. Current web Payments UI exposes Add and Delete, not an Edit button; do not invent an Edit workflow as claimed parity.
- [x] D10 Loading, empty, offline/stale, policy change, validation/save/delete error and confirmed-success feedback.

### E. Renewal and historical loans

Sources: [RenewalModal.tsx](../web/src/pages/clients/RenewalModal.tsx), [renewal.ts](../web/src/lib/renewal.ts), [renewals.ts](../web/src/services/renewals.ts).

- [x] E01 Fully-paid entry point; availability depends on identifiers, complete confirmed receipts/history, eligibility and active admin/developer authorization.
- [x] E02 Require valid receipt dates/amounts and payoff on/before due date; every previous renewal must have timely settlement. Missing paying dates alone are not a rejection reason.
- [x] E03 New principal, fixed interest, term, approval date, daily payable, suggested amount, total preview, new transaction explanation, admin notes <=1,500, reviewed-history approval checkbox, Cancel/Grant/busy/error.
- [x] E04 Approval date >= payoff date and <= today; monetary maximum PHP 999,999,999 and at most two decimals for renewal inputs. Changing terms clears review approval; another-session renewal requires reopening.
- [x] E05 Server rechecks of actor, loan/revision, receipts, holidays and history; unique new transaction, stable public ID, incremented cycle/count, original-transaction reference, immutable previous/new snapshots and approver metadata.
- [x] E06 History loading/error/retry; newest sequence first; current identity/count/transaction; renewal timestamp, approver name/UID, notes, all new loan terms/due-at-approval.
- [x] E07 Expand old transaction for old principal, interest, daily, term, approval, paid total, payoff/due dates, zero closing balance and historical receipt dates/amounts/collector/notes.

### F. Trash and retention

Sources: [TrashPage.tsx](../web/src/pages/clients/TrashPage.tsx), [TrashAutoDeletion.tsx](../web/src/components/TrashAutoDeletion.tsx), [client-trash-operations.ts](../web/src/services/client-trash-operations.ts).

- [x] F01 Single/bulk recycle confirmation; remove from active reports, preserve client, receipt and renewal data and identifier reservations. Resume unfinished clients and report partial success.
- [x] F02 Back to Clients; total/recoverable counts, retention summary, Manage retention link and preservation/permanent-deletion explanation.
- [x] F03 Identity/contact/address/transaction search; All/Recoverable/Deletion started filters; newest deleted then ID; matching/total count; 25/page, range, previous/next/current page and live clamping.
- [x] F04 Name/avatar, client ID/transaction, Manila deletion time, deleted-by name, recoverable/purging status and automatic-deletion date.
- [x] F05 Individual/page/all-matching selection, selected count/Clear; single/bulk Restore and Permanently delete; Retry permanent deletion.
- [x] F06 No restore after purge starts; bulk restore disabled when selection includes purging rows. Restore keeps original references and never overwrites a current client.
- [x] F07 Irreversible purge confirmation; resumable operation IDs and purge markers, stale trash-instance protection, receipt/history batch progress and partial-failure retry.
- [x] F08 Retention Never/3/7/30 days from trash time; changes affect existing trash; already-started purge finishes even if policy later disabled.
- [x] F09 Match current admin-session automatic cleanup and catch-up; bounded passes (currently 25 candidates, 100 receipt/history chunks), current-policy recheck, cleanup-error notice and automatic retry.
- [x] F10 Loading/no-trash/no-matches/error/server-freshness states; offline/stale mutations gated.

### G. Print Studio and all exports

Sources: [PrintablesPage.tsx](../web/src/pages/PrintablesPage.tsx), [print-renderer.ts](../web/src/lib/print-renderer.ts), [print-export.ts](../web/src/lib/print-export.ts), [printables.ts](../web/src/lib/printables.ts), [promissory.html](../web/src/templates/promissory.html), original promissory DOCX and print.css.

- [x] G01 Printing Mode/View Only. View Only hides settings shortcut, paper editor, reset and outputs but retains document/client/date/grid/zoom/preview. Mode switches retain selection/layout.
- [x] G02 Index Card/Promissory Note/Daily Summary Sheet; client deep-link preselection and shared index/note selection; independent summary selection initially all clients.
- [x] G03 Sorted borrower selection; normalized partial-name/ID/transaction search ignoring accents/case/punctuation, name words any order, exact-ID ranking; single/bulk selection, select all matches/mixed state, Clear, selected/match counts and 50-result Show more. Preserve selected clients outside search results.
- [x] G04 Summary date defaults to today; historical date picker, no future date.
- [x] G05 Per-document Template/A4/Letter/Legal/Custom paper; Portrait/Landscape; custom width/height 70–600 mm, margin 0–30 mm, font 6–18 pt in 0.5 increments; finite-number validation.
- [x] G06 Session-only layout overrides; Reset print options restores current document's saved defaults, today/grid-on/75% zoom while preserving selected clients.
- [x] G07 Preview page/client count, preparing/ready, physical dimensions, optional 10 mm grid, 40/50/60/75/100/125% zoom and scrolling/panning.
- [x] G08 Print, Save PDF, Export DOCX, multi-client DOCX ZIP bundle, standalone HTML. Output omits app chrome/grid. Summary is one report DOCX; index/note bundle is one DOCX per borrower.
- [x] G09 Missing identifiers block output and link to maintenance; content overflow warns and blocks fixed-page Print/PDF; DOCX/HTML retain overflow content. Invalid layouts/feed/settings/render/export errors, busy/success, no-clients/no-selection states.

Index Card content:
- [x] G10 Logo, uppercase lender, branch, fixed BORROWER'S COPY, mobile, full borrower, approval, address, principal-or-total printed amount, term, saved daily, client ID/transaction and additional-card number.
- [x] G11 Four columns numbered down then across; active-cycle receipts combined by actual paying date, no skipped-date gaps, stop after payoff while retaining actual payoff amount, additional cards for excess paying dates, blank signature spaces.
- [x] G12 Template 238x122 mm landscape, 2 mm margin, 11 pt; template height increases 5.08 mm per extra row where applicable.

Promissory Note content:
- [x] G13 Principal, approval date, uppercase borrower/address, payee, principal+fixed-interest total in pesos/centavos and words, term, saved daily, interest/service wording, execution date/place, cellphone and identifiers.
- [x] G14 Original clauses, acknowledgment/notary wording, borrower/co-maker signature columns, blank valid ID/number/issue/contact/court-venue/co-maker/notary/signature fields.
- [x] G15 Preserve sanitized original DOCX structure; default A4 portrait, 12.7 mm margin, 12 pt.

Daily Summary content:
- [x] G16 Selected clients including zero-collection clients; last/first/full-middle ordering; Index, Transaction, Client ID, Client Name, Amount, Date, Collected by, Notes.
- [x] G17 Actual-date collections across cycles, relevant transaction references, distinct collector/note values joined by semicolons, blank notes use configured default.
- [x] G18 Logo/lender/branch, date, page number, all-clients/X-of-Y scope, last-page grand total, client/collecting-client counts, Prepared by/Checked by blanks.
- [x] G19 Paginated A4 landscape, 10 mm margin, 9 pt default.

There is no drag/drop designer, image-upload control, arbitrary template editor or document-import workflow in the current web UI. These are not missing parity features.

### H. Consolidation / Liquidation ledger

Sources: [LiquidationPage.tsx](../web/src/pages/LiquidationPage.tsx), [consolidation.ts](../web/src/lib/consolidation.ts).

- [x] H01 Live/paused freshness state, total payments, principal, principal-minus-payments balance, matched-client count and PHP labels.
- [x] H02 Collection/principal percentage, visual progress clamped to 0–100 while numeric percentage may exceed 100; totals cover every filtered match.
- [x] H03 Name/client-ID/transaction search, All/45/50/58 term filter; alphabetical/ID order; reset/clamp pagination.
- [x] H04 Name, transaction/Pending, public ID, approval/release date, term, day 1–58 amounts, total payments, principal and balance.
- [x] H05 Combine same-date receipts, retain receipt counts, highlight term endpoint and later days; paying-date count and +N after day 58.
- [x] H06 Current-cycle payments including post-payoff and >58-day receipts in totals/history; negative balances retained; interest excluded from this report balance.
- [x] H07 First columns/Jump to totals equivalents; each day/history action opens full ledger details.
- [x] H08 History identity/term/total/principal/balance and all paying-day ordinals, dates, counts and amounts, including days beyond 58.
- [x] H09 Grand totals across all matches; 10/25/50/100 rows (default 25), range, previous/next/page count; no-clients/no-matches/no-payments/loading/error states.

### I. Collectors & Admins

Sources: [CollectorsPage.tsx](../web/src/pages/collectors/CollectorsPage.tsx), [AccountFormModal.tsx](../web/src/pages/collectors/AccountFormModal.tsx), [accounts.ts](../web/src/services/accounts.ts).

- [x] I01 Add collector and Add admin; team/active/admin/collector counts; managed roles restricted to admin and collector.
- [x] I02 Name/email/phone search; role All/Admin/Collector, status All/Active/Inactive; alphabetical order.
- [x] I03 Avatar/name/You marker, role, immutable login email, optional cellphone, status and added timestamp.
- [x] I04 Edit, Activate/Deactivate, Reset password, Delete with confirmations, busy/errors/success. No own deletion/deactivation; own name/phone editable.
- [x] I05 Create fixed-role form: full name, optional Philippine cellphone, lowercased/trimmed valid email, initial password >= 8, role explanation, Cancel/Create and inline errors.
- [x] I06 Edit name/phone only; show unchanged email, no role/password editing. Reset sends a confirmed password-reset email.
- [x] I07 Separate provisioning Auth instance preserves admin session, creates active profile with server time, attempts rollback of new Auth user on profile failure, then signs out provisioning instance.
- [x] I08 Delete profile revokes data access and retains receipts; Firebase Auth login remains until separately removed in Console. Preserve this distinction in confirmation text.
- [x] I09 Server/profile-error mutation safeguards; missing-email reset disabled; page sizes 10/25/50 (default 10), range/previous/next/count/clamping; loading/no-accounts/no-matches/error.

### J. Holidays

Source: [HolidaysPage.tsx](../web/src/pages/HolidaysPage.tsx), holidays service and validation.

- [x] J01 Sundays-already-excluded explanation; saved/upcoming counts and next holiday or none.
- [x] J02 Month calendar previous/next/Today, weekdays, selected date, saved-date dots, today marker and legend.
- [x] J03 Selection synchronizes date/name for an existing holiday; new date retains name draft; valid date input changes visible month.
- [x] J04 Date/name editor, UI name max 80, required cleaned name/valid calendar date, formatted weekday preview and existing-date update notice; no past/future restriction.
- [x] J05 Add/upsert by date (no duplicates), distinct added/updated success, clear after save, inline/busy/error states.
- [x] J06 Saved date/name/Upcoming-or-Past/Delete; name/ISO/formatted-date search; All/Upcoming/Past chips, today upcoming, newest date first.
- [x] J07 Delete confirmation explains collection-day restoration and potentially earlier due dates.
- [x] J08 All affected loan schedules update. Loading/no-holidays/no-matches/error; use bounded native loading even though web has no pagination.

### K. Settings and record maintenance

Source: [SettingsPage.tsx](../web/src/pages/SettingsPage.tsx), [settings.ts defaults](../web/src/config/settings.ts), [settings service](../web/src/services/settings.ts), [PrintLayoutFields.tsx](../web/src/components/PrintLayoutFields.tsx).

- [x] K01 Six destinations/deep links: General, Payment policy, Trash & retention, Index card, Promissory note, Print defaults.
- [x] K02 General: workspace name max 120; future client-ID prefix max 20, begins letter, then letters/digits/_/-; digits 1–10 and example; default payment note max 500; recent-payment/due-client limits 1–100.
- [x] K03 Expandable incomplete-record count and Complete existing client records action; fill missing public IDs/transaction/daily without renaming or overwriting existing references; disabled when nothing incomplete.
- [x] K04 Payment-policy switch with informational/minimum explanation, per-receipt enforcement and admin final-settlement exemption.
- [x] K05 Retention Never/3/7/30, existing-trash effect and started-purge explanation.
- [x] K06 Index lender max 120, branch max 200, mobile max 40, printed amount Principal+interest/Principal, heading and cell color pickers; valid six-digit hex colors.
- [x] K07 Promissory payee max 200, execution place max 300, verbatim interest/service-charge statement max 1500. Wording does not recalculate fixed interest.
- [x] K08 Independent layout defaults for all three documents: full paper/orientation/dimension/margin/font controls and bounds from G05.
- [x] K09 Shared staged draft across sections; Save settings, Discard changes, Restore defaults into draft; dirty/all-saved indicator and busy/success/error.
- [x] K10 Other-session conflict warning, Reload saved settings, stale-save block and transactional opening-baseline comparison; unavailable settings disable editing/save.
- [x] K11 Shared updates include actor/time; initialize missing documents without overwriting existing values; Print Studio overrides stay separate.

Default text:
- Workspace MCL Dashboard; client prefix mcl with 4 digits; note Daily Payment; recent 15/due 10; minimum off; retention Never.
- Lender MCL Lending; branch San Miguel, Tagum City; mobile 09758143163; printed amount principal+interest; heading #f5efa5 and cells #a1bfcd.
- Payee CRISTOPHER A. LASARTE; execution place Compostela, Davao de Oro, and Philippines.
- Interest statement: PHP 150.00 per thousand and PHP 20.00 service charge per thousand.

## Brand design tokens

Source: current index.css, feature CSS, lib/theme.ts, Icon.tsx, Logo.tsx and print templates.

| Token | Light | Dark |
| --- | --- | --- |
| Background | #f5f7fa | #111a27 |
| Surface | #ffffff | #192434 |
| Alternate surface | #f0f4f8 | #202e40 |
| Border | #e0e6ee | #2b3c50 |
| Text | #1c2b3e | #e7edf5 |
| Muted text | #65758a | #a1b1c5 |
| Primary | #1f4e79 | #86b6df |
| Primary hover | #173b5c | #a0c8eb |
| Primary container | #eaf1f8 | #223b52 |
| Focus ring | #1f4e7940 | #86b6df50 |
| Due background/text | #fde8e8 / #a11a1a | #442a32 / #f0a0a5 |
| Pending background/text | #fdf1c7 / #7a5400 | #403723 / #e9c775 |
| Paid background/text | #dff3e4 / #1b6b34 | #203e35 / #8bd4b1 |
| Chart blue | #1f4e79 | #86b6df |
| Chart paid | #3a8a70 | #69b89d |
| Chart pending | #c28a2e | #d7af62 |
| Chart due | #bb6264 | #de9095 |

- Shape: 10px principal web radius; secondary 4/6/8/9px; pills/circles fully rounded. Translate into named Compose shape/dimension tokens and mobile touch sizes rather than copy CSS pixels mechanically.
- UI type: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; no custom UI font bundled. Body 14px/line-height 1.45, weights normal through 700, strong financial totals. Use Android's Roboto with a coherent Material3 type scale.
- Print type differs: Calibri/Arial; index Aptos Narrow/Arial Narrow/Arial; note includes Bell MT/Times New Roman. PDF fallback/embedding and DOCX font declarations need explicit fidelity checks; proprietary font availability cannot be assumed.
- Existing public/assets/logo.png is the orange-ring MCL shield/LENDING/2021 logo; preserve it.
- Icons: existing custom outline SVGs, 24x24, 1.7 stroke, rounded caps/joins. Convert/reuse as Android vectors.
- Shadows: light 0 2px 5px #192e4904 plus 0 8px 24px #192e4903; dark 0 2px 8px #00000010. Map to theme elevation.
- Short web transitions roughly 140–180ms and reduced-motion handling. Native motion respects accessibility animation settings.
- Keep colors, semantic status/chart colors, typography, shapes, spacing, control sizes and elevation in ui/theme. Do not let dynamic system colors replace the MCL palette by default.

## Business rules that must survive the port

- PHP money, centavo precision and bounded values; use integer centavos or BigDecimal in Kotlin and map to existing Firestore numeric fields at the boundary. Interest is a fixed amount, never a percentage.
- Calendar dates retain YYYY-MM-DD meaning; Manila/UTC+8 determines financial today. Entry timestamps remain timestamps.
- Collection day 1 is after approval. Sundays and configured holidays do not count toward 45/50/58-day due dates.
- Paid means no outstanding; Due means remaining outstanding with today >= due date; otherwise Pending.
- Loan outstanding = max(0, principal + fixed interest - current-cycle receipts).
- Consolidation balance = principal - current-cycle receipts, may be negative; do not substitute outstanding.
- Index days count actual unique paying dates, group same-date receipts and stop after payoff. Consolidation retains later receipts. Daily Summary uses actual date across cycles.
- Legacy untagged payments belong to initial cycle only. Never move old or pending receipts into a renewed loan.
- Deleted account profiles retain financial receipts. Recycled clients leave active reports and retain ledger until restored/purged.

## Implemented architecture and performance approach

The native implementation uses the requested root packages under com.mcl.mcllendingapp:

- data/local: Room entities/DAOs and account-scoped cached records, pages, summaries and pending-receipt recovery.
- data/remote: native Firebase adapters and bounded query/cursor implementations.
- data/mapper and data/repository: explicit mapping and domain repository implementations.
- domain/model, domain/repository and domain/usecase/<feature>: pure Kotlin models/interfaces and one action per UseCase with one operator invoke.
- presentation/navigation, presentation/components and presentation/<feature>: Screen, ViewModel and UiState files per screen.
- ui/theme, di and util: branding tokens, Hilt modules and narrowly scoped shared utilities.

One class per file. One ViewModel per screen with a single immutable UiState StateFlow and one onEvent entry point. Domain has no Android imports; business calculations stay outside Composables. Common Loading/Success/Empty/Error states plus per-action progress/field errors distinguish refreshes from initial loads. KDoc only on ViewModels and UseCases.

Implemented choices (source-reviewed; runtime/release acceptance remains separate):
1. Kotlin + Material3 Compose; serializable typed Navigation Compose routes carrying IDs, saved per-tab stacks and WindowSizeClass layouts. This follows the owner's explicit Navigation Compose requirement.
2. Hilt, Coroutines/Flow, lifecycle-aware collection and listener ownership. Screen-scoped bounded listeners stop when the screen is no longer visible; session authorization remains active for the visible signed-in workspace.
3. Room-backed bounded query pages with Firestore cursors, stable item keys and deterministic sorting. Cursor paging avoids introducing Android paging types into pure domain interfaces and preserves explicit page controls where feasible.
4. WorkManager refreshes account-scoped cache with connection constraints and authorization checks. Cached reads remain available with freshness/error cues. Preserve financial drafts/recovery; never mark a receipt saved before acknowledgment or silently replay a financial operation on reconnect.
5. Lifecycle-safe state, SavedStateHandle/saveable drafts and scroll, decimal/phone/email keyboards and IME/system-inset handling. Remove portrait/configChanges workarounds when native state restoration is verified.
6. Coil for cached/resized images as needed; keep local logo/vector assets local. Compute reports, map data and render/export documents away from the main thread.
7. Native Canvas charts with accessible data summaries and selection. Native document preview/render/export layer for physical layouts; Android Print Framework and document-save/share APIs; actual PDF/DOCX/ZIP/HTML outputs. Preserving all formats and note structure is a dedicated feature, not an implicit benefit of Compose.
8. Release minification/resource shrinking, narrowly justified keep rules, release smoke checks and Baseline Profile module covering login/startup and primary navigation.

Official references checked:
- [Type-safe Navigation Compose](https://developer.android.com/guide/navigation/design/type-safety)
- [Room-backed network paging architecture](https://developer.android.com/topic/libraries/architecture/paging/v3-network-db)
- [WorkManager request scheduling](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)

### Bounded synchronization, atomic Room snapshots and remaining costs

The native implementation does not require new backend aggregate documents. Firestore cursor queries read bounded pages into account-scoped staging records. A completed authorized snapshot is atomically published to Room; a failed refresh retains the previous completed cache rather than publishing partial financial totals. SQL queries over that complete local snapshot provide bounded screen/history pages, full-match search and selection, current-cycle calculations and filtered report totals. Bulk/export work iterates bounded pages. Filtering a single fetched page is not used as a substitute for whole-snapshot search or grand totals.

Foreground reconciliation runs on a five-minute interval in addition to the relevant foreground updates; WorkManager requests connected, authorized background refreshes separately. Reconciliation still scans remote history in bounded pages. This bounds individual reads and working memory, but read volume, network traffic, synchronization time and local database size still grow with ledger history. Five-minute reconciliation is not a constant-cost server aggregate service or an instantaneous guarantee for every out-of-window change. Performance and billing acceptance at production data volumes remain pending.

Same-ID receipt retries, server-confirmed authorization, stale-record checks and cycle isolation are implemented. Outstanding balance is still read before a receipt transaction, and distinct receipt identifiers do not share a per-loan balance write. Concurrent receipts/corrections can therefore pass the same pre-read balance. Atomic Room publication protects the consistency of cached reports; it does not serialize financial writes on the backend. Strict server-side enforcement would require a separately coordinated backend/rules/web change and reconciliation of existing data.

No backend service, default Cloud Functions deployment, production rules deployment or data migration was performed by this native port. The existing shared Firebase contract remains the production authority.

Automatic trash deletion preserves current admin-session/catch-up behavior. WorkManager cannot reproduce a one-minute timer: periodic work has a 15-minute minimum and may be delayed. Use an active-session bounded cleanup loop/foreground catch-up for current parity; background cache sync is separate. Do not silently extend irreversible deletion to unauthenticated background sessions.

## Implementation coverage and acceptance sequence

| Order | Feature | Checklist coverage / acceptance |
| --- | --- | --- |
| 1 | Native foundation, theme, navigation, authentication and role shell | A; typed routes, phone/tablet shell, state/error handling, native Firebase configuration and test sign-in. |
| 2 | Data cache and Clients | C; bounded Firestore synchronization, atomic Room snapshots/SQL aggregates, paged list/detail/forms, identifiers and stale-edit checks. |
| 3 | Payments and collector workflow | D, A08; financial-domain tests, pending same-ID recovery, minimum policy and correction permissions. |
| 4 | Renewal and history | E; legacy/current cycle isolation, eligibility and stale-session behavior. |
| 5 | Dashboard | B; verified report totals, charts, selected periods and configured limits. |
| 6 | Consolidation | H; all 58 visible day slots plus later history, negative principal balance and filtered grand totals. |
| 7 | Collectors & Admins | I; secondary-auth provisioning, self safeguards, reset and profile-delete semantics. |
| 8 | Holidays | J; calendar editing and recomputed due dates. |
| 9 | Settings and Trash | K, F; staged conflict-safe settings, maintenance, retention, reversible restore and resumable purge. |
| 10 | Print Studio and exports | G; all modes/options/content, physical layouts, overflow and actual PDF/DOCX/ZIP/HTML files. |
| 11 | Release acceptance and cleanup | All checkboxes, profile/shrinking and final role/device/offline audit. |

All native feature groups above have been implemented and source-reviewed following the owner's authorization to continue through the complete port. Checked inventory items record implementation coverage rather than a claim that every acceptance check has passed. Final verification, production integration and release/device acceptance remain distinct; the current evidence table below takes precedence over the original staged approval plan.

Meaningful verification:
- Domain cases for centavos, date/holiday schedules, status boundaries, payoff grouping, after-day-58 totals, cycle isolation and renewals.
- Emulator/test-project cases for roles, profile revocation, stale edits, same-ID receipts, deletion tombstones, identifier allocation, settings conflicts and resumable trash operations.
- UI checks for loading/empty/error, form validation, search/filter/selection/page clamping, rotation/process recreation, offline drafts and retained uncertain receipts.
- Phone/tablet and light/dark previews/screenshots; accessibility semantics and hardware-keyboard interactions where applicable.
- Output fixtures for physical dimensions, content/overflow, totals and original note clauses; inspect DOCX/ZIP/HTML/PDF artifacts.
- Debug build, relevant unit/instrumentation checks and lint at feature checkpoints; release build/shrinking and Baseline Profile verification at release acceptance. No production test writes.

Native cleanup has been completed: the retired mobile workspace/assets, old collector/payment UI and repository classes, their dependent starter tests, obsolete launcher assets and npm bundling path were removed after reference checks. The active MCL logo, shared web source/CSS/templates, historical documents, restricted document WebViews and legacy pending-receipt reader/import chain remain. Installed WebView storage and unresolved receipt data are preserved; removing source assets does not require clearing application data. Live upgrade/recovery acceptance is still pending.

## Final verification status

See [VERIFICATION-2026-11-05.md](./VERIFICATION-2026-11-05.md) for the fixes, commands and detailed verification evidence. No unchecked live behavior is represented as a passed test.

| Check | Current evidence / status |
| --- | --- |
| Native debug APK | Built and deployed; sign-in and appearance interaction checked on API 37. Artifact: app/build/outputs/apk/debug/app-debug.apk. |
| Android lint | Passed on the final source, including test inspections. |
| Optimized release APK | Built on the final source with R8 and resource shrinking; unsigned artifact. |
| Local unit tests | 39 passed, covering calculations, draft restoration, settings, print selection/search and preview/export state. |
| Android instrumentation tests | 14 passed: 9 Room queries/snapshots/cleanup cases, 4 sign-in UI cases and 1 packaged document-rendering case. |
| Baseline Profile | Generator/module infrastructure is implemented; device profile capture and packaged-profile verification remain pending. |
| Live Firebase account acceptance | Pending: authorized roles, revocation, shared-writer behavior, renewal, receipt reconciliation and deployed-rule compatibility. |
| Device/layout/printing acceptance | Pending: phone/tablet and light/dark behavior, retained drafts, accessibility/keyboard checks, export fidelity and physical printing. |
| Backend deployment/data migration | None performed. |

The native implementation has passed the local checks above. Production integration, profile capture and coordinated backend receipt-concurrency enforcement remain acceptance items. The verification report records those limits; no live backend deployment or production data migration was performed.
