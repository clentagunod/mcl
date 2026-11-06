package com.mcl.mcllendingapp.presentation.trash

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun TrashScreen(onClients: () -> Unit = {}, onRetention: () -> Unit = {}, viewModel: TrashViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    TrashContent(state, viewModel::onEvent, onClients, onRetention)
}

@Composable
fun TrashContent(state: TrashUiState, onEvent: (TrashEvent) -> Unit, onClients: () -> Unit, onRetention: () -> Unit) {
    val formatter = remember { DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a").withZone(ZoneId.of("Asia/Manila")) }
    val blocked = state.busy || !state.page.fresh || state.error != null
    LazyColumn(Modifier.widthIn(max = AppDimensions.fieldMaxWidth).fillMaxSize(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
        item {
            Text("Trash", style = MaterialTheme.typography.headlineMedium)
            Text("Restore deleted clients with their original IDs, payments and renewal history, or permanently remove them.")
            TextButton(onClick = onClients) { Text("Back to clients") }
        }
        item {
            Text("In Trash " + (state.page.counts["total"] ?: state.page.total) + " · Recoverable " + (state.page.counts["recoverable"] ?: 0), style = MaterialTheme.typography.labelLarge)
            Text(when (state.retentionDays) { null -> "Loading retention policy…"; 0 -> "Automatic deletion is turned off."; else -> "Automatic deletion after " + state.retentionDays + " days, including payments and renewal history." })
            TextButton(onClick = onRetention) { Text("Manage retention") }
        }
        item {
            OutlinedTextField(state.search, { onEvent(TrashEvent.Search(it)) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Search deleted clients") })
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("all" to "All clients", "trashed" to "Recoverable", "purging" to "Deletion started")) { (value, label) ->
                    FilterChip(selected = state.filter == value, onClick = { onEvent(TrashEvent.Filter(value)) }, label = { Text(label) })
                }
            }
            Text(state.page.total.toString() + " matching clients", style = MaterialTheme.typography.bodySmall)
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { error -> item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error)
                    TextButton(onClick = { onEvent(TrashEvent.Retry) }) { Text("Retry") }
                }
            }
        } }
        if (!state.page.fresh && !state.loading) item { Text("Waiting for server confirmation. Connect to the internet to manage Trash.") }
        state.message?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
        item {
            Text(state.selected.size.toString() + " selected", style = MaterialTheme.typography.titleMedium)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                item { TextButton(onClick = { onEvent(TrashEvent.SelectPage) }, enabled = state.page.items.isNotEmpty() && !state.busy) { Text("Select page") } }
                item { TextButton(onClick = { onEvent(TrashEvent.SelectAll) }, enabled = state.page.total > 0 && !state.busy) { Text("Select all " + state.page.total + " matching") } }
                item { TextButton(onClick = { onEvent(TrashEvent.ClearSelection) }, enabled = state.selected.isNotEmpty() && !state.busy) { Text("Clear") } }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                item { OutlinedButton(onClick = { onEvent(TrashEvent.Confirm("restore", state.selected.toList())) }, enabled = !blocked && state.selected.isNotEmpty() && state.selectedPurging.isEmpty()) { Text("Restore selected") } }
                item { OutlinedButton(onClick = { onEvent(TrashEvent.Confirm("purge", state.selected.toList())) }, enabled = !blocked && state.selected.isNotEmpty()) { Text("Permanently delete selected", color = MaterialTheme.colorScheme.error) } }
            }
        }
        if (!state.loading && state.page.items.isEmpty()) item { Text(if (state.search.isBlank() && state.filter == "all") "Trash is empty." else "No deleted clients match these filters.") }
        items(state.page.items, key = { it.id }) { entry ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Row {
                        Checkbox(modifier = Modifier.semantics { contentDescription = "Select " + entry.client.displayName }, checked = entry.id in state.selected, onCheckedChange = { onEvent(TrashEvent.Toggle(entry.id)) }, enabled = !state.busy)
                        Column(Modifier.weight(1f)) {
                            Text(entry.client.displayName, style = MaterialTheme.typography.titleMedium)
                            Text(entry.client.publicId + " · Txn " + entry.client.transactionNumber.ifBlank { "Pending" })
                        }
                    }
                    Text("Deleted " + (entry.deletedAt?.let { formatter.format(Instant.ofEpochMilli(it)) } ?: "Pending"))
                    Text("Deleted by " + entry.deletedByName.ifBlank { "Administrator" })
                    Text(if (entry.status == "purging") "Deletion started — retry to finish" else "Ready to restore", color = if (entry.status == "purging") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                    if (entry.status == "trashed" && (state.retentionDays ?: 0) > 0 && entry.deletedAt != null) {
                        Text("Auto deletion: " + formatter.format(Instant.ofEpochMilli(entry.deletedAt + state.retentionDays!! * 86_400_000L)), style = MaterialTheme.typography.bodySmall)
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                        item { TextButton(onClick = { onEvent(TrashEvent.Confirm("restore", listOf(entry.id))) }, enabled = !blocked && entry.status != "purging") { Text("Restore") } }
                        item { TextButton(onClick = { onEvent(TrashEvent.Confirm("purge", listOf(entry.id))) }, enabled = !blocked) { Text(if (entry.status == "purging") "Retry permanent deletion" else "Permanently delete", color = MaterialTheme.colorScheme.error) } }
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { onEvent(TrashEvent.PreviousPage) }, enabled = state.page.page > 0 && !state.loading) { Text("Previous") }
                Text("Page " + (state.page.page + 1) + " · " + state.page.total + " clients", modifier = Modifier.weight(1f).padding(AppSpacing.small))
                TextButton(onClick = { onEvent(TrashEvent.NextPage) }, enabled = state.page.hasMore && !state.loading) { Text("Next") }
            }
        }
    }
    if (state.pendingIds.isNotEmpty() && state.operation != null) {
        val restoring = state.operation == "restore"
        AlertDialog(onDismissRequest = { onEvent(TrashEvent.Dismiss) }, title = { Text(if (restoring) "Restore clients" else "Permanently delete clients") }, text = {
            Column {
                Text(if (restoring) "Restore " + state.pendingIds.size + " clients with their original IDs, payments and renewal history?" else "Permanently delete " + state.pendingIds.size + " clients and all their payment records and renewal history? This cannot be undone. Once deletion starts, restoration is unavailable.")
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        }, confirmButton = { TextButton(onClick = { onEvent(TrashEvent.Execute) }, enabled = !state.busy) { Text(if (state.busy) "Working…" else if (restoring) "Restore" else "Permanently delete") } }, dismissButton = { TextButton(onClick = { onEvent(TrashEvent.Dismiss) }, enabled = !state.busy) { Text("Cancel") } })
    }
}
