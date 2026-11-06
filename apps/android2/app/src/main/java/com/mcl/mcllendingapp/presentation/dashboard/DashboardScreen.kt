package com.mcl.mcllendingapp.presentation.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.ui.theme.BrandColors
import com.mcl.mcllendingapp.util.displayDate
import com.mcl.mcllendingapp.util.displayTime
import com.mcl.mcllendingapp.util.money
import kotlin.math.max
import kotlin.math.roundToInt

@Composable
fun DashboardScreen(onClients: () -> Unit, onAccounts: () -> Unit, onClient: (String) -> Unit, viewModel: DashboardViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    DashboardContent(state, viewModel::onEvent, onClients, onAccounts, onClient)
}

@Composable
fun DashboardContent(state: DashboardUiState, onEvent: (DashboardEvent) -> Unit, onClients: () -> Unit, onAccounts: () -> Unit, onClient: (String) -> Unit) {
    var information by rememberSaveable { mutableStateOf<String?>(null) }
    val stats = state.stats
    val explanations = remember {
        mapOf(
            "Collected today" to "Total recorded receipts whose payment date is today, including receipts entered later for that date.",
            "Collected this month" to "Receipts with a payment date in the current calendar month. Entry timestamps do not change this total.",
            "Total outstanding balance" to "Unpaid principal and fixed interest for current loans after their current-loan payments. Clients in Trash are excluded.",
            "Total principal released" to "Principal amounts on current client records. This is not a lifetime total of earlier renewed loans.",
        )
    }
    LazyColumn(Modifier.widthIn(max = AppDimensions.contentMaxWidth).fillMaxSize(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
        item {
            Text("Dashboard", style = MaterialTheme.typography.headlineMedium)
            Text("A clear view of your lending activity and collections.")
            Text(displayDate(state.today) + " · " + if (state.fresh) "Live workspace overview" else "Awaiting live confirmation", style = MaterialTheme.typography.labelLarge)
            state.lastSynced?.let { Text("Last updated " + displayTime(it), style = MaterialTheme.typography.bodySmall) }
            Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                Button(onClick = onClients) { Text("View clients") }
                OutlinedButton(onClick = { onEvent(DashboardEvent.Refresh) }, enabled = !state.refreshing) { Text(if (state.refreshing) "Refreshing…" else "Refresh") }
            }
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { error -> item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error)
                    Text("Displayed cached information may be incomplete.", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { onEvent(DashboardEvent.Refresh) }, enabled = !state.refreshing) { Text("Retry") }
                }
            }
        } }
        if (!state.loading && state.error == null && stats.totalClients == 0) item { Text("No clients yet. Add your first client to start tracking lending activity.") }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    FinancialCard("Collected today", stats.todayCollection, "Today's payment dates", Modifier.weight(1f)) { information = "Collected today" }
                    FinancialCard("Collected this month", stats.monthCollection, "Recorded payment dates", Modifier.weight(1f)) { information = "Collected this month" }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    FinancialCard("Total outstanding balance", stats.totalOutstanding, "Principal and fixed interest", Modifier.weight(1f)) { information = "Total outstanding balance" }
                    FinancialCard("Total principal released", stats.totalPrincipal, "Current client loans", Modifier.weight(1f)) { information = "Total principal released" }
                }
            }
        }
        item {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                if (maxWidth >= AppDimensions.fieldMaxWidth) {
                    Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
                        CollectionChart(state, onEvent, Modifier.weight(1f))
                        LoanStatusDonut(state, onClients, Modifier.weight(1f))
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
                        CollectionChart(state, onEvent)
                        LoanStatusDonut(state, onClients)
                    }
                }
            }
        }
        item {
            Text("Recent payments", style = MaterialTheme.typography.titleLarge)
            Text("Latest " + state.recentLimit + " recorded entries", style = MaterialTheme.typography.bodySmall)
            if (!state.loading && state.error == null && stats.recentPayments.isEmpty()) Text("No payments recorded yet.")
        }
        items(stats.recentPayments, key = { "payment:" + it.id }) { payment ->
            Card(Modifier.fillMaxWidth().clickable(enabled = stats.recentClientNames.containsKey(payment.clientId)) { onClient(payment.clientId) }) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(stats.recentClientNames[payment.clientId] ?: "Deleted client", style = MaterialTheme.typography.titleMedium)
                    Text(money(payment.amount), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Text("Collector: " + payment.collectorName.ifBlank { "—" })
                    Text("Payment date: " + displayDate(payment.paymentDate))
                    Text("Entered: " + displayTime(payment.createdAt), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item {
            Text("Clients with a due balance", style = MaterialTheme.typography.titleLarge)
            Text(stats.dueClients.toString() + " due · highest outstanding balances first", style = MaterialTheme.typography.bodySmall)
            if (!state.loading && state.error == null && stats.due.isEmpty()) Text("No clients are due.")
        }
        items(stats.due, key = { "client:" + it.id }) { client ->
            Card(Modifier.fillMaxWidth().clickable { onClient(client.id) }) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(client.displayName, style = MaterialTheme.typography.titleMedium)
                    Text(money(client.outstanding), style = MaterialTheme.typography.titleLarge)
                    Text("Due " + displayDate(client.dueDate) + " · " + client.status.replaceFirstChar { it.uppercase() })
                }
            }
        }
        if (stats.dueClients > stats.due.size) item { Text("Showing " + stats.due.size + " of " + stats.dueClients + " due clients."); TextButton(onClick = onClients) { Text("View the client list") } }
        item {
            Text("Collector activity today", style = MaterialTheme.typography.titleLarge)
            Text("Entries and collections for " + displayDate(state.today), style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onAccounts) { Text("Manage accounts") }
            if (!state.loading && state.error == null && state.collectorActivity.isEmpty()) Text("No collectors yet. Add one in Collectors & Admins.")
        }
        items(state.collectorActivity, key = { "collector:" + it.id }) { activity ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(activity.name, style = MaterialTheme.typography.titleMedium)
                    Text(activity.count.toString() + " entries · " + money(activity.amount))
                    Text("Last entry: " + (activity.lastEntry?.let { displayTime(it) } ?: if (activity.count > 0) "Awaiting server time" else "No entries yet"), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    information?.let { title ->
        AlertDialog(onDismissRequest = { information = null }, title = { Text(title) }, text = { Text(explanations[title].orEmpty()) }, confirmButton = { TextButton(onClick = { information = null }) { Text("Close") } })
    }
}

@Composable
private fun FinancialCard(label: String, value: Double, hint: String, modifier: Modifier, onInfo: () -> Unit) {
    Card(modifier) {
        Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
            Text(label, style = MaterialTheme.typography.labelLarge)
            Text(money(value), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(hint, style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onInfo, modifier = Modifier.semantics { contentDescription = "About " + label.lowercase() }) { Text("About") }
        }
    }
}

@Composable
private fun CollectionChart(state: DashboardUiState, onEvent: (DashboardEvent) -> Unit, modifier: Modifier = Modifier) {
    val selected = state.points.getOrNull(state.selectedIndex)
    val primary = MaterialTheme.colorScheme.primary
    val muted = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
    val grid = MaterialTheme.colorScheme.outlineVariant
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
            Text("Collection trend", style = MaterialTheme.typography.titleLarge)
            Text("Collected amounts by payment date", style = MaterialTheme.typography.bodySmall)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf(7, 14, 30)) { days -> FilterChip(selected = state.days == days, onClick = { onEvent(DashboardEvent.Range(days)) }, label = { Text(days.toString() + "D") }) }
            }
            Text(money(state.periodAmount), style = MaterialTheme.typography.headlineSmall)
            Text(state.periodReceipts.toString() + " receipts over " + state.days + " days")
            selected?.let { Text(displayDate(it.date) + (if (it.date == state.today) " · Today" else "") + " · " + money(it.amount) + " · " + it.receipts + " receipts", style = MaterialTheme.typography.labelLarge) }
            if (state.points.isNotEmpty()) {
                val ceiling = max(100.0, state.points.maxOf { it.amount })
                Text(money(ceiling), style = MaterialTheme.typography.labelSmall)
                Canvas(Modifier.fillMaxWidth().height(AppDimensions.chartHeight).semantics {
                    contentDescription = "Collection trend. " + state.periodReceipts + " receipts totaling " + money(state.periodAmount) + ". Use the day slider to inspect each date."
                }.pointerInput(state.points) {
                    detectTapGestures { position ->
                        val index = (position.x / size.width * state.points.size).toInt().coerceIn(state.points.indices)
                        onEvent(DashboardEvent.SelectDate(state.points[index].date))
                    }
                }) {
                    val border = AppDimensions.border.toPx()
                    listOf(0f, 0.5f, 1f).forEach { fraction -> drawLine(grid, Offset(0f, size.height * fraction), Offset(size.width, size.height * fraction), border) }
                    val step = size.width / state.points.size
                    state.points.forEachIndexed { index, point ->
                        val barHeight = (point.amount / ceiling * size.height).toFloat()
                        drawRoundRect(
                            color = if (index == state.selectedIndex) primary else muted,
                            topLeft = Offset(index * step + step * 0.15f, size.height - barHeight),
                            size = Size(step * 0.7f, barHeight),
                            cornerRadius = CornerRadius(AppSpacing.extraSmall.toPx()),
                        )
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(state.points.first().date.takeLast(5), style = MaterialTheme.typography.labelSmall)
                    Text(state.points[state.points.size / 2].date.takeLast(5), style = MaterialTheme.typography.labelSmall)
                    Text(state.points.last().date.takeLast(5), style = MaterialTheme.typography.labelSmall)
                }
                Slider(value = state.selectedIndex.toFloat(), onValueChange = { index -> onEvent(DashboardEvent.SelectDate(state.points[index.roundToInt().coerceIn(state.points.indices)].date)) }, valueRange = 0f..state.points.lastIndex.toFloat(), steps = (state.points.size - 2).coerceAtLeast(0), modifier = Modifier.semantics {
                    contentDescription = "Inspect collection day"
                    stateDescription = selected?.let { displayDate(it.date) + ", " + money(it.amount) + ", " + it.receipts + " receipts" }.orEmpty()
                })
                Text(if (state.periodReceipts == 0) "No collections in this period." else "Tap a day or move the slider to inspect collections. Arrow keys adjust the focused slider.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun LoanStatusDonut(state: DashboardUiState, onClients: () -> Unit, modifier: Modifier = Modifier) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    val colors = mapOf("due" to BrandColors.ChartDue, "pending" to BrandColors.ChartPending, "paid" to BrandColors.ChartPaid)
    Card(modifier.fillMaxWidth()) {
        Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
            Text("Loan status", style = MaterialTheme.typography.titleLarge)
            Text("Current loans across all clients", style = MaterialTheme.typography.bodySmall)
            Box(Modifier.size(AppDimensions.chartHeight).align(Alignment.CenterHorizontally), contentAlignment = Alignment.Center) {
                Canvas(Modifier.fillMaxSize().semantics { contentDescription = state.stats.totalClients.toString() + " total clients: " + state.segments.joinToString { it.count.toString() + " " + it.label } }) {
                    val stroke = AppDimensions.chartBar.toPx()
                    val inset = stroke / 2
                    drawArc(track, -90f, 360f, false, Offset(inset, inset), Size(size.width - stroke, size.height - stroke), style = Stroke(stroke))
                    var start = -90f
                    state.segments.forEach { segment ->
                        val sweep = if (state.stats.totalClients > 0) segment.count * 360f / state.stats.totalClients else 0f
                        drawArc(colors.getValue(segment.tone), start, sweep, false, Offset(inset, inset), Size(size.width - stroke, size.height - stroke), style = Stroke(stroke))
                        start += sweep
                    }
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.stats.totalClients.toString(), style = MaterialTheme.typography.headlineLarge)
                    Text("Total clients", style = MaterialTheme.typography.labelSmall)
                }
            }
            state.segments.forEach { segment -> Text(segment.label + " · " + segment.count + " · " + segment.percent + "%", color = colors[segment.tone] ?: MaterialTheme.colorScheme.onSurface) }
            Text(if (state.stats.totalClients == 0) "Add your first client to start tracking loan status." else if (state.stats.dueClients > 0) state.stats.dueClients.toString() + " clients have a balance at or past the due date." else "No clients have a balance at or past the loan due date.", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onClients) { Text("View all clients") }
        }
    }
}
