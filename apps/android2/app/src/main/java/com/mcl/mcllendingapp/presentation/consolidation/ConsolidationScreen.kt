package com.mcl.mcllendingapp.presentation.consolidation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.util.displayDate
import com.mcl.mcllendingapp.util.money
import java.util.Locale

@Composable
fun ConsolidationScreen(onClient: (String) -> Unit, viewModel: ConsolidationViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ConsolidationContent(state, viewModel::onEvent, onClient)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsolidationContent(state: ConsolidationUiState, onEvent: (ConsolidationEvent) -> Unit, onClient: (String) -> Unit) {
    LazyColumn(Modifier.widthIn(max = AppDimensions.contentMaxWidth).fillMaxSize(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
        item {
            Text("Consolidation / Liquidation", style = MaterialTheme.typography.headlineMedium)
            Text("Track payments, review collection days and reconcile each loan.")
            Text(if (state.page.fresh) "Live collection ledger" else "Refresh paused · cached ledger", style = MaterialTheme.typography.labelLarge)
            TextButton(onClick = { onEvent(ConsolidationEvent.Refresh) }, enabled = !state.refreshing) { Text(if (state.refreshing) "Refreshing…" else "Refresh") }
        }
        item {
            LedgerTotalCard("Total payment", state.totalPayment, "All receipts for matched clients")
            Spacer(Modifier.height(AppSpacing.small))
            LedgerTotalCard("Principal", state.totalPrincipal, state.page.total.toString() + " clients in this view")
            Spacer(Modifier.height(AppSpacing.small))
            LedgerTotalCard("Balance · principal − payments", state.totalBalance, "Principal balance, excluding fixed interest")
            Text(String.format(Locale.ENGLISH, "%.1f%% collected against principal", state.collectedPercent), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = AppSpacing.small))
            LinearProgressIndicator(progress = { state.progress }, modifier = Modifier.fillMaxWidth())
            Text("Totals update with your filters and cover all matching clients.", style = MaterialTheme.typography.bodySmall)
        }
        item {
            Text("Collection ledger", style = MaterialTheme.typography.titleLarge)
            Text("PHP · Philippine peso", style = MaterialTheme.typography.labelSmall)
            OutlinedTextField(state.search, { onEvent(ConsolidationEvent.Search(it)) }, Modifier.fillMaxWidth(), label = { Text("Search name, client ID or transaction") }, singleLine = true)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("all" to "All terms", "45" to "45 days", "50" to "50 days", "58" to "58 days")) { (value, label) ->
                    FilterChip(selected = state.term == value, onClick = { onEvent(ConsolidationEvent.Term(value)) }, label = { Text(label) })
                }
            }
            var sortMenu by rememberSaveable { mutableStateOf(false) }
            Box {
                TextButton(onClick = { sortMenu = true }) { Text("Sort clients") }
                DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                    listOf("default" to "Name A–Z", "name_desc" to "Name Z–A").forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { sortMenu = false; onEvent(ConsolidationEvent.Sort(value)) })
                    }
                }
            }
            Text("Each paying date is one numbered day, combining receipts collected on the same date. The loan endpoint marks day 45, 50 or 58.", style = MaterialTheme.typography.bodySmall)
            Text("Principal balance includes every current-loan payment, including after day 58. Negative balances show excess over principal. Dashboard outstanding also includes fixed interest.", style = MaterialTheme.typography.bodySmall)
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { error -> item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error)
                    Text("Displayed information may be incomplete.", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { onEvent(ConsolidationEvent.Refresh) }, enabled = !state.refreshing) { Text("Retry") }
                }
            }
        } }
        if (!state.page.fresh && !state.loading && state.error == null) item { Text("Showing cached information while awaiting server confirmation.") }
        if (!state.loading && state.error == null && state.page.items.isEmpty()) item { Text(if (state.search.isBlank() && state.term == "all") "No clients available yet." else "No clients match the search and loan term.") }
        items(state.page.items, key = { it.client.id }) { row ->
            Card(Modifier.fillMaxWidth().clickable { onEvent(ConsolidationEvent.OpenLedger(row.client.id)) }) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(row.client.displayName, style = MaterialTheme.typography.titleMedium)
                    Text(row.client.publicId + " · Txn " + row.client.transactionNumber.ifBlank { "Pending" })
                    Text("Released " + displayDate(row.client.approvalDate) + " · " + row.client.loanTermDays + " days")
                    Text("Paid " + money(row.totalPayment) + " · Principal " + money(row.principal))
                    Text("Principal balance " + money(row.balance), style = MaterialTheme.typography.titleMedium)
                    Text(row.totalPayingDays.toString() + " paying days" + (if (row.totalPayingDays > 58) " · +" + (row.totalPayingDays - 58) + " after day 58" else ""), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { onEvent(ConsolidationEvent.OpenLedger(row.client.id)) }) { Text("Open daily ledger & history") }
                }
            }
        }
        item {
            Text("Grand totals · all " + state.page.total + " matching clients", style = MaterialTheme.typography.titleMedium)
            Text("Paid " + money(state.totalPayment) + " · Principal " + money(state.totalPrincipal) + " · Balance " + money(state.totalBalance))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf(10, 25, 50, 100)) { count -> FilterChip(selected = state.page.pageSize == count, onClick = { onEvent(ConsolidationEvent.PageSize(count)) }, label = { Text(count.toString() + " per page") }) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { onEvent(ConsolidationEvent.PreviousPage) }, enabled = state.page.page > 0 && !state.loading) { Text("Previous") }
                Text("Page " + (state.page.page + 1) + " · " + state.page.total + " clients", Modifier.weight(1f).padding(AppSpacing.small))
                TextButton(onClick = { onEvent(ConsolidationEvent.NextPage) }, enabled = state.page.hasMore && !state.loading) { Text("Next") }
            }
        }
    }
    if (state.selectedId != null) {
        ModalBottomSheet(onDismissRequest = { onEvent(ConsolidationEvent.CloseLedger) }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
            LedgerDetailContent(state, onEvent, onClient)
        }
    }
}

@Composable
private fun LedgerTotalCard(label: String, value: Double, caption: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(money(value), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            Text(caption, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun LedgerDetailContent(state: ConsolidationUiState, onEvent: (ConsolidationEvent) -> Unit, onClient: (String) -> Unit) {
    val detail = state.detail
    LazyColumn(Modifier.fillMaxWidth().fillMaxHeight(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
        item {
            Text("Payment history / daily ledger", style = MaterialTheme.typography.titleLarge)
            detail.client?.let { Text(it.displayName, style = MaterialTheme.typography.titleMedium) }
            TextButton(onClick = { onEvent(ConsolidationEvent.CloseLedger) }) { Text("Close") }
            Text(if (detail.history.fresh) "Live current-loan ledger" else "Showing cached ledger while awaiting server confirmation", style = MaterialTheme.typography.bodySmall)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("client" to "Client fields", "matrix" to "Days 1–58", "history" to "All paying dates", "totals" to "Jump to totals")) { (value, label) ->
                    FilterChip(selected = state.ledgerTab == value, onClick = { onEvent(ConsolidationEvent.LedgerTab(value)) }, label = { Text(label) })
                }
            }
        }
        if (detail.loading) item { CircularProgressIndicator() }
        detail.error?.let { error -> item {
            Text(error, color = MaterialTheme.colorScheme.error)
            TextButton(onClick = { onEvent(ConsolidationEvent.Refresh) }, enabled = !state.refreshing) { Text("Retry") }
        } }
        when (state.ledgerTab) {
            "client" -> detail.client?.let { client -> item {
                Text("Client: " + client.displayName)
                Text("Client ID: " + client.publicId)
                Text("Transaction: " + client.transactionNumber.ifBlank { "Pending" })
                Text("Date of release: " + displayDate(client.approvalDate))
                Text("Loan term: " + client.loanTermDays + " days")
                TextButton(onClick = { onEvent(ConsolidationEvent.CloseLedger); onClient(client.id) }) { Text("View client") }
            } }
            "totals" -> item {
                LedgerTotalCard("Total payment", detail.totalPayment, "All current-loan receipts")
                Spacer(Modifier.height(AppSpacing.small))
                LedgerTotalCard("Principal", detail.principal, "Fixed interest is excluded")
                Spacer(Modifier.height(AppSpacing.small))
                LedgerTotalCard("Principal balance", detail.balance, "Principal minus all current-loan payments")
                Text(detail.totalPayingDays.toString() + " paying dates, including any after day 58.")
            }
            "matrix" -> {
                item {
                    Text("58-day ledger", style = MaterialTheme.typography.titleMedium)
                    Text("Select an amount to inspect its collection history. A blank day means no paying date has occupied that slot.", style = MaterialTheme.typography.bodySmall)
                    if (detail.totalPayingDays > 58) Text((detail.totalPayingDays - 58).toString() + " more paying dates are available in All paying dates.", style = MaterialTheme.typography.labelLarge)
                    if (!detail.loading && detail.error == null && detail.totalPayingDays == 0) Text("No payments recorded.")
                }
                items(detail.matrix, key = { it.day }) { day -> LedgerDayCard(day) { onEvent(ConsolidationEvent.InspectDay(day.day)) } }
            }
            "history" -> {
                if (detail.historyLoading) item { CircularProgressIndicator() }
                detail.historyError?.let { error -> item {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { onEvent(ConsolidationEvent.Refresh) }) { Text("Retry history") }
                } }
                if (!detail.historyLoading && detail.historyError == null && detail.error == null && detail.history.items.isEmpty()) item { Text("No payments recorded.") }
                items(detail.historyItems, key = { it.date ?: it.day.toString() }) { day -> LedgerDayCard(day, null) }
                item {
                    Text("All " + detail.history.total + " paying dates · " + detail.history.pageSize + " per page", style = MaterialTheme.typography.bodySmall)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { onEvent(ConsolidationEvent.PreviousHistoryPage) }, enabled = detail.history.page > 0 && !detail.historyLoading) { Text("Previous") }
                        Text("Page " + (detail.history.page + 1), Modifier.weight(1f).padding(AppSpacing.small))
                        TextButton(onClick = { onEvent(ConsolidationEvent.NextHistoryPage) }, enabled = detail.history.hasMore && !detail.historyLoading) { Text("Next") }
                    }
                }
            }
        }
    }
}

@Composable
private fun LedgerDayCard(day: LedgerDayItem, onInspect: (() -> Unit)?) {
    val container = when {
        day.endpoint -> MaterialTheme.colorScheme.primaryContainer
        day.afterTerm -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.surface
    }
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = container)) {
        Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
            Text("Day " + day.day + (if (day.endpoint) " · Loan endpoint" else if (day.afterTerm) " · After loan term" else ""), style = MaterialTheme.typography.titleSmall)
            Text(day.date?.let { displayDate(it) } ?: "No payment")
            Text(day.amount?.let { money(it) } ?: "—", style = MaterialTheme.typography.titleMedium)
            if (day.date != null) Text(day.receipts.toString() + " receipts", style = MaterialTheme.typography.bodySmall)
            if (day.amount != null && onInspect != null) TextButton(onClick = onInspect, modifier = Modifier.semantics { contentDescription = "View history for day " + day.day }) { Text("View payment history") }
        }
    }
}
