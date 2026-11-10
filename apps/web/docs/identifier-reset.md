# Client and transaction numbering after permanent deletion

By default, deleting clients does not reset numbering. The app retains sequence counters and identifier reservations so numbers cannot accidentally be reused while records, Trash entries, or historical references remain.

Open **Settings → Trash & retention**, enable **Reset numbering when all clients are permanently deleted**, and save settings to change this behavior. The preference is shared in Firestore at `settings/Configurations/elements/identifierPolicy`, with `resetWhenEmpty`, `updatedAt`, and `updatedBy`. It defaults to Off and is managed by active admins/developers only.

When enabled:

- A completed permanent deletion resets both numbering counters only after Clients and Trash are both empty. The next client starts at 1 for both numbers, e.g. mcl0001 and 00001.
- The client prefix and number of digits come from the current General settings. The transaction number remains five digits.
- Moving clients to Trash does not reset numbering. Permanent deletion of only some clients does not reset it. Recoverable and still-purging Trash entries also prevent a reset.
- Automatic retention cleanup follows the same preference as manual permanent deletion.
- If the workspace was already emptied before enabling this setting, the next client creation restarts numbering.
- Turning the preference off keeps subsequent numbering continuous; it does not undo a reset already completed or alter existing numbers.

Public numbers can be reused after a full cleanup. Internal client record IDs are always fresh after a reset, keeping old expenses, audit records, renewal links, and stale collector forms separate from a new borrower. Financial records are not reassigned or erased by a counter reset.

The implementation uses a numbering epoch in the counter and identifier reservations. Old reservations do not need to be deleted in bulk. Transactions serialize numbering changes and client/Trash membership changes through the counter document, and empty-workspace checks read the server rather than cached lists.

Shared files changed: canonical `apps/web/firestore.rules` and its root mirror; shared settings types and identifier allocation/renewal services. Optional Cloud Functions trash/renewal code has matching behavior. See `apps/android/context.md` before adapting a separate native Android allocator: it must preserve the epoch, honor current-series reservations, and use immutable client document IDs for all references.

Publish the updated canonical rules and web build before release. The web path does not require Cloud Functions; deployments using the optional callables must update those functions too. This change does not publish anything or reset production data automatically.
