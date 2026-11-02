# Collector payment edits

Install the rebuilt app/build/outputs/apk/debug/app-debug.apk.

Before collectors can save edits, paste the complete firestore.collector-edits.rules from this Android directory into Firebase Console > Firestore Database > Rules and Publish. The existing apps/web/firestore.rules was not changed; update your deployment source to this reviewed version before any later rules deployment, or later deployment of the old source will disable collector edits again.

The prepared rules let active collectors edit only their own receipts, changing only amount, actual payment date and notes. Collector identity, original creation timestamp and client reference cannot change. Deletes remain administrator-only. Current daily minimum policy remains enforced. These rules have not been deployed by the agent.

Edit payment on a client opens receipt history; each of the collector's receipts has an Edit payment button. Other collectors' receipts remain read-only. Client details remain administrator-only.

The app now imports the website's actual renderPrintDocument renderer and print.css inside a read-only iframe, preserving its four payment columns, signature lines, colors, logo, page dimensions and multi-page layout. The viewport starts fit-to-width and supports zoom and scrolling. It updates as client/payment data changes.

To display saved web styling for collectors, the prepared rules additionally allow get access to exactly settings/Printables/elements/indexTemplate and settings/Printables/elements/studio. Collectors still cannot list the settings collection or change settings. Publish the updated complete rules file even if you already deployed the earlier collector edit rules. Without these reads, the app shows the website's standard defaults with a notice. Admins use their existing shared settings.

The prepared rules file was repaired after a malformed regex replacement was discovered. Use this current complete file for deployment. Nothing was deployed automatically.

Manual acceptance: use a test collector to edit amount/date/notes on their own receipt, verify real-time updates in the website, confirm another collector's receipts have no edit action, and view/scroll/zoom the card on the phone. No live customer records were modified during implementation.
