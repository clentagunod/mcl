# Web client Trash

On the Clients page, select individual rows, the current page, or all clients matching
the search and status filters. Selection persists across pages and resets when filters
change. **Move selected to Trash** asks for confirmation. The row's **Delete** action
also moves the client to Trash, including clients with renewals.

Open **Trash** in the sidebar to search deleted clients, restore them, or permanently
delete them individually or in bulk. In **Settings > Configurations / Trash**, choose
automatic deletion after **3, 7, or 30 days**, or **Do not automatically delete** (the
default). The period starts at the original deletion timestamp and changes apply to
existing Trash records too. Restoring recreates
the original document ID and fields, with the original payments and renewal history.
Recycled clients and their payments are excluded from active web reports.

## Firestore and service

- `clientTrash/{originalClientId}` stores the raw client snapshot, deletion timestamp,
  administrator ID/name, generation (`trashId`), and cleanup state.
- `settings/Configurations/elements/trashPolicy` persists `autoDeleteDays` (`0`, `3`,
  `7`, or `30`), with the editor ID and timestamp. Existing settings initialization,
  live subscriptions, and conflict detection include this admin-only document.
- Automatic cleanup runs on admin sign-in, policy changes, reconnection, and every
  minute while the web app is open. It catches up at the next admin session if no
  administrator was online when a record expired. No background server job is needed.
  Each pass checks at most 25 expired records and 25 interrupted deletions. It uses
  the same resumable permanent deletion as manual actions, including payment and
  renewal cleanup. Every new deletion rechecks the saved policy and Trash generation
  in a transaction, so disabling/extending retention or restoring a record cancels
  stale candidates. Deletion already started finishes even if retention is turned off.
  Failures are displayed in the app and retried automatically.
- While recycled, payments remain linked in `payments` and renewals remain under
  `clients/{id}/renewals`. The active parent client document is absent. Receipt writes
  and renewals require an active client; no Android code changes are required.
- `clientTrashOperations/{operationId}` stores admin-only operation metadata so retrying
  cannot repeat a completed move or restoration. Only active admins/developers can
  access Trash or its operation markers. Collectors cannot change either collection.
- `src/services/client-trash-operations.ts` uses Firestore browser transactions directly.
  Moves and restores commit one client at a time to respect security-rule lookup limits.
  Each move requires an exact source snapshot and atomic active-document deletion;
  each restore requires the matching snapshot and atomic Trash deletion. The web retains
  request IDs across retries and reports how many clients have completed.
- Permanent deletion first marks a record `purging`, blocking restoration. Bounded
  transactions remove all linked payments (including closed loan cycles) and renewal
  history, then remove the Trash record. If interrupted, use **Retry permanent deletion**.
  Stale Trash generations and existing active client IDs are rejected.
- Identifier reservations, receipt deletion markers, and legacy receipt audit events are retained. Client,
  public client, and transaction identifiers are reserved before recycling legacy records.

All changes are in the web application and its Firestore rules. The Android project is
untouched. The web rules sync script updates only the root copy, so running web checks
or rule synchronization cannot rewrite Android files. Both apps use the same active
client collection, so recycling a client removes that client from shared active data.

## Verify and deploy

From `apps/web`:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:spark
npx.cmd playwright test tests/client-trash.e2e.ts tests/clients-pagination.e2e.ts tests/renewal.e2e.ts
```

No Cloud Functions or Blaze upgrade is needed. After building, deploy the updated rules
and website to the actual Firebase project ID:

```powershell
npx.cmd firebase-tools deploy --only "firestore:rules,hosting" --config firebase.print-studio.json --project YOUR_PROJECT_ID
```

Local builds and tests do not deploy or modify production data. Firestore creates each
new collection on the first successful operation; no manual collection setup is needed.
