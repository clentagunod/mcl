package com.mcl.mcllendingapp.presentation.collectors

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun CollectorsScreen(viewModel: CollectorsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    CollectorsContent(state, viewModel::onEvent)
}

@Composable
fun CollectorsContent(state: CollectorsUiState, onEvent: (CollectorsEvent) -> Unit) {
    LazyColumn(
        modifier = Modifier.widthIn(max = AppDimensions.fieldMaxWidth).fillMaxSize(),
        contentPadding = PaddingValues(AppSpacing.medium),
        verticalArrangement = Arrangement.spacedBy(AppSpacing.small),
    ) {
        item {
            Text("Collectors & Admins", style = MaterialTheme.typography.headlineMedium)
            Text("Manage your team's accounts, access and sign-in details.")
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                item { Button(onClick = { onEvent(CollectorsEvent.Add("collector")) }, enabled = state.page.fresh && !state.busy) { Text("Add collector") } }
                item { OutlinedButton(onClick = { onEvent(CollectorsEvent.Add("admin")) }, enabled = state.page.fresh && !state.busy) { Text("Add admin") } }
            }
        }
        item {
            val counts = state.page.counts
            Text("Team " + (counts["total"] ?: state.page.total) + " · Active " + (counts["active"] ?: 0) + " · Admins " + (counts["admins"] ?: 0) + " · Collectors " + (counts["collectors"] ?: 0), style = MaterialTheme.typography.labelLarge)
            Text("Your own account is protected from deletion and deactivation.", style = MaterialTheme.typography.bodySmall)
        }
        item {
            OutlinedTextField(state.search, { onEvent(CollectorsEvent.Search(it)) }, Modifier.fillMaxWidth(), label = { Text("Search name, email or phone") }, singleLine = true)
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("all" to "All roles", "admin" to "Admins", "collector" to "Collectors")) { (value, label) ->
                    FilterChip(selected = state.role == value, onClick = { onEvent(CollectorsEvent.FilterRole(value)) }, label = { Text(label) })
                }
            }
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("all" to "All statuses", "active" to "Active", "inactive" to "Inactive")) { (value, label) ->
                    FilterChip(selected = state.status == value, onClick = { onEvent(CollectorsEvent.FilterStatus(value)) }, label = { Text(label) })
                }
            }
            var sorting by remember { mutableStateOf(false) }
            Box {
                TextButton(onClick = { sorting = true }) { Text("Sort accounts") }
                DropdownMenu(expanded = sorting, onDismissRequest = { sorting = false }) {
                    listOf("default" to "Name A–Z", "name_desc" to "Name Z–A", "recent" to "Recently added").forEach { (value, label) ->
                        DropdownMenuItem(text = { Text(label) }, onClick = { sorting = false; onEvent(CollectorsEvent.Sort(value)) })
                    }
                }
            }
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { error -> item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error)
                    TextButton(onClick = { onEvent(CollectorsEvent.Retry) }) { Text("Retry") }
                }
            }
        } }
        state.message?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
        if (!state.page.fresh && !state.loading) item { Text("Showing cached accounts. Connect to the internet to manage access.") }
        if (!state.loading && state.page.items.isEmpty()) item { Text(if (state.search.isBlank() && state.role == "all" && state.status == "all") "No accounts yet. Add an admin or collector." else "No accounts match these filters.") }
        items(state.page.items, key = { it.uid }) { account ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(account.fullName + if (account.uid == state.currentUserId) " (You)" else "", style = MaterialTheme.typography.titleMedium)
                    Text(account.role.replaceFirstChar { it.uppercase() } + " · " + if (account.active) "Active" else "Inactive", color = MaterialTheme.colorScheme.primary)
                    Text(account.email)
                    Text(account.phone.ifBlank { "No cellphone number" })
                    Text("Added " + account.createdAt?.let { Instant.ofEpochMilli(it).atZone(ZoneId.of("Asia/Manila")).format(DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a")) }.orEmpty(), style = MaterialTheme.typography.bodySmall)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                        item { TextButton(onClick = { onEvent(CollectorsEvent.Edit(account)) }, enabled = state.page.fresh && !state.busy) { Text("Edit") } }
                        item { TextButton(onClick = { onEvent(CollectorsEvent.Confirm(account, "toggle")) }, enabled = state.page.fresh && !state.busy && account.uid != state.currentUserId) { Text(if (account.active) "Deactivate" else "Activate") } }
                        item { TextButton(onClick = { onEvent(CollectorsEvent.Confirm(account, "reset")) }, enabled = state.page.fresh && !state.busy && account.email.isNotBlank()) { Text("Reset password") } }
                        item { TextButton(onClick = { onEvent(CollectorsEvent.Confirm(account, "delete")) }, enabled = state.page.fresh && !state.busy && account.uid != state.currentUserId) { Text("Delete", color = MaterialTheme.colorScheme.error) } }
                    }
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf(10, 25, 50)) { size -> FilterChip(selected = state.page.pageSize == size, onClick = { onEvent(CollectorsEvent.PageSize(size)) }, label = { Text(size.toString() + " per page") }) }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { onEvent(CollectorsEvent.PreviousPage) }, enabled = state.page.page > 0 && !state.loading) { Text("Previous") }
                Text("Page " + (state.page.page + 1) + " · " + state.page.total + " accounts", modifier = Modifier.weight(1f).padding(AppSpacing.small))
                TextButton(onClick = { onEvent(CollectorsEvent.NextPage) }, enabled = state.page.hasMore && !state.loading) { Text("Next") }
            }
        }
    }

    state.draft?.let { draft ->
        Dialog(onDismissRequest = { onEvent(CollectorsEvent.Dismiss) }, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = !state.busy, dismissOnClickOutside = false)) {
            Surface(Modifier.fillMaxSize()) {
                Column(Modifier.widthIn(max = AppDimensions.fieldMaxWidth).fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
                    Text((if (draft.uid == null) "Add " else "Edit ") + draft.role, style = MaterialTheme.typography.headlineMedium)
                    Text(if (draft.role == "admin") "Administrators manage the shared lending workspace and team accounts." else "Collectors record receipts in the collection workspace.")
                    AccountInputField("Full name", draft.fullName, state.fieldErrors["fullName"], KeyboardType.Text, state.busy) { onEvent(CollectorsEvent.Draft(draft.copy(fullName = it))) }
                    AccountInputField("Cellphone (optional)", draft.phone, state.fieldErrors["phone"], KeyboardType.Phone, state.busy) { onEvent(CollectorsEvent.Draft(draft.copy(phone = it))) }
                    if (draft.uid == null) {
                        AccountInputField("Login email", draft.email, state.fieldErrors["email"], KeyboardType.Email, state.busy) { onEvent(CollectorsEvent.Draft(draft.copy(email = it))) }
                        OutlinedTextField(value = draft.password, onValueChange = { onEvent(CollectorsEvent.Draft(draft.copy(password = it))) }, modifier = Modifier.fillMaxWidth(), label = { Text("Password") }, supportingText = { Text(state.fieldErrors["password"] ?: "At least 8 characters. Share privately.") }, isError = state.fieldErrors.containsKey("password"), singleLine = true, enabled = !state.busy, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                    } else {
                        Text("Login email: " + draft.email + ". Use Reset password in the list to send a reset email.")
                    }
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                        Button(onClick = { onEvent(CollectorsEvent.Save) }, enabled = !state.busy && state.page.fresh) { Text(if (state.busy) "Saving…" else if (draft.uid == null) "Create account" else "Save changes") }
                        OutlinedButton(onClick = { onEvent(CollectorsEvent.Dismiss) }, enabled = !state.busy) { Text("Cancel") }
                    }
                }
            }
        }
    }
    state.pendingAccount?.let { account ->
        val operation = state.pendingOperation
        val title = when (operation) { "delete" -> "Delete " + account.role; "reset" -> "Reset password"; else -> if (account.active) "Deactivate account" else "Activate account" }
        val message = when (operation) {
            "delete" -> "Delete " + account.fullName + "? Data access ends immediately. Existing receipts are retained. The Firebase Authentication login remains until removed in Firebase Console."
            "reset" -> "Send a password reset email to " + account.email + "?"
            else -> if (account.active) account.fullName + " will lose access immediately. You can activate the account again later." else "Restore workspace access for " + account.fullName + "?"
        }
        AlertDialog(onDismissRequest = { onEvent(CollectorsEvent.Dismiss) }, title = { Text(title) }, text = { Column { Text(message); state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } } }, confirmButton = {
            TextButton(onClick = { onEvent(CollectorsEvent.Execute) }, enabled = !state.busy && state.page.fresh) { Text(if (state.busy) "Working…" else if (operation == "reset") "Send email" else "Confirm") }
        }, dismissButton = { TextButton(onClick = { onEvent(CollectorsEvent.Dismiss) }, enabled = !state.busy) { Text("Cancel") } })
    }
}

@Composable
private fun AccountInputField(label: String, value: String, error: String?, keyboardType: KeyboardType, busy: Boolean, onChange: (String) -> Unit) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, isError = error != null, supportingText = { if (error != null) Text(error) }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = keyboardType))
}
