# Consolidation accounting and optional expenses

Consolidation reports on current client loan cycles. It updates as receipts, client details, settings, and expenses change. It does not include earlier renewed loans or clients in Trash.

## Settings

Open **Settings → Collections & expenses**. Save changes to persist them in `settings/Configurations/elements/accountingPolicy` and update connected web sessions.

- **Principal first** (default): recover principal before recognizing collected interest.
- **Proportional allocation**: split received payments using the loan's principal-to-interest ratio.
- **Enable expenses** (off by default): display Expenses directly below Consolidation and deduct posted paid expenses. Disabling retains records and types but stops subscriptions and excludes their amounts from all calculations. Direct access redirects to settings.

For a ₱10,000 principal, ₱1,250 interest, and ₱5,000 collected:

| Method | Principal recovered | Interest collected |
| --- | ---: | ---: |
| Principal first | ₱5,000.00 | ₱0.00 |
| Proportional | ₱4,444.44 | ₱555.56 |

Changing the policy recalculates current-loan reporting, including earlier receipts. It does not alter receipts or loan terms. Collected interest is capped at contracted interest; excess payments remain cash received, not extra earned interest. Calculations use cumulative allocation and centavo rounding, with exact integer arithmetic for proportional allocation.

## Financial fields

Open **Settings → Consolidation metrics** to choose which optional metrics appear. The default view always shows **Total payment, Principal, Payable Amount, and Contracted Interest**; these four cannot be disabled and have no switches.

The six optional switches are **Balance, Interest collected, Recorded expenses, Net income, Principal released, and Cash surplus / deficit**. They default to Off and apply consistently to cards, ledger columns/totals, payment history, and the calculation-window preview. Save settings to share the choices across sessions and connected administrators/developers.

Visibility is presentation only: hiding Recorded expenses does not disable expenses or remove deductions from Net income. All financial calculations continue with the same allocation, date, and expense rules.

Preferences persist in `settings/Configurations/elements/consolidationMetrics` as six boolean fields (`balance`, `interestCollected`, `expenseAmount`, `netIncome`, `principalReleased`, `cashSurplus`) plus update attribution. Missing documents and missing/incorrectly typed fields use Off defaults. Required metrics have no configurable fields. Firestore rules reject attempts to disable them through this document.

| Field | Definition |
| --- | --- |
| Contracted Interest | Full fixed interest agreed for the current loan; replaces the previous Net Income label |
| Interest collected | Interest portion of payments actually received, using the selected allocation |
| Recorded expenses | Posted paid costs included by the report's dates and loan scope |
| Net income | Interest collected minus recorded expenses |
| Principal released | Current-loan principal whose approval/release date falls inside the window; full principal for All collection dates |
| Cash surplus / deficit | Collections minus principal released and cash expenses |

Principal is tracked separately from operating expenses. Net income is a cash-collection measure for these current loans and recorded costs, not a full accrual-accounting income statement. Unrecorded costs are not estimated.

## Date windows and filters

Collection dates and paid-expense dates are inclusive calendar dates. Interest for a window is cumulative allocated interest through its end minus cumulative allocated interest before its start. Earlier receipts must be considered to determine whether principal has already been recovered. Principal released before the window is not deducted again in its cash surplus.

The existing loan balance remains full payable minus payments included in the window. It is a period calculation, not a historical as-of balance. Principal, payable amount, and contracted interest remain the full amounts for each matched current loan. Clients without payments stay in the report.

Loan expenses follow the exact client and current loan ID, then the selected paid dates. Per-client rows show only expenses assigned to that loan. Shared business costs are included once in unfiltered portfolio grand totals, never arbitrarily spread across clients. A client search or loan-term filter excludes shared costs and displays an explanation. Pagination does not change the totals.

Shared costs have no loan-cycle assignment: All collection dates includes all posted shared costs. This scope is stated on the page. A historical period after a loan has renewed will not include that old loan's receipts or assigned costs; a complete lifetime business report would require a separate historical-loan ledger.

## Expense workflow

1. Enable expenses in settings and save.
2. Open Expenses and expand **Expense types**. Add relevant types, such as salaries, transportation, rent, supplies, or bank fees. No sample expenses are automatically created.
3. Record money already paid: type, amount in PHP, paid date, description, optional receipt reference, and either a current loan or Shared business expense. Future dates and loan costs before release are rejected.
4. Review entries by paid dates, status, type, or search. The default view shows posted costs for this month through today. All paid dates clears date limits. Totals cover every matching entry across pages.
5. Correct an entry with Edit. Each correction preserves its immutable previous revision and creation attribution; stale edits are rejected.
6. Void incorrect entries with a reason. Voided entries remain available under the status filter and in History, but leave calculations. Voiding is final; create a new entry if needed.
7. Archive unused types to stop new entries. Existing expenses retain their recorded type name and remain in reports. Reactivate types when needed.

All entries are paid cash expenses. The feature does not automatically generate recurring bills, estimate expenses, accept unpaid liabilities, or handle foreign currencies. Negative income and cash deficits are valid. If expense records are not confirmed by the server, dependent totals show Unavailable and editing is paused.

## Shared deployment and Android compatibility

The new accounting document, `expenseCategories`, `expenses`, and immutable `expenses/{id}/history` writes are validated in `apps/web/firestore.rules`, mirrored to root `firestore.rules`. Existing client, payment, loan schedule, and collector payment policies are retained. Only active admins/developers can access expense data; collectors are denied. Expenses must be enabled for writes. Authorized reads remain allowed regardless of the feature flag so policy transitions cannot permanently fail live listeners; the app still unsubscribes and hides the page when disabled. Settings are applied only from server-confirmed snapshots, including metadata-only write acknowledgements.

Deploy the canonical rules before releasing this web version. On administrator sign-in, missing settings documents initialize with principal-first allocation and expenses disabled; saved values are never replaced. This implementation did not deploy rules or modify production data.

Android implementation guidance and complete field definitions are in `apps/android/context.md`. Android source and Android-specific rules were not changed by this task.
