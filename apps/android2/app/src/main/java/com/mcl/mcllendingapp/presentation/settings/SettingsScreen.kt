package com.mcl.mcllendingapp.presentation.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.ui.theme.AppDimensions

@Composable
fun SettingsScreen(initialSection: String? = null, viewModel: SettingsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(initialSection) { initialSection?.let { viewModel.onEvent(SettingsEvent.Section(it)) } }
    SettingsContent(state, viewModel::onEvent)
}

@Composable
fun SettingsContent(state: SettingsUiState, onEvent: (SettingsEvent) -> Unit) {
    val fields = remember(state.section) { settingFields(state.section) }
    LazyColumn(Modifier.widthIn(max = AppDimensions.fieldMaxWidth).fillMaxSize().imePadding(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
        item {
            Text("Settings", style = MaterialTheme.typography.headlineMedium)
            Text("Shared workspace configuration and document templates. Review your draft before saving.")
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(settingsSections, key = { it.first }) { (value, label) ->
                    FilterChip(selected = state.section == value, onClick = { onEvent(SettingsEvent.Section(value)) }, label = { Text(label) })
                }
            }
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { error -> item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error)
                    TextButton(onClick = { onEvent(SettingsEvent.Retry) }) { Text("Retry") }
                }
            }
        } }
        if (state.conflict) item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text("Settings changed in another session. Reload saved settings to avoid overwriting newer changes.")
                    TextButton(onClick = { onEvent(SettingsEvent.Discard) }, enabled = !state.busy) { Text("Reload saved settings") }
                }
            }
        }
        if (!state.loading && state.saved.revision.isBlank()) item {
            Text("This workspace has no saved settings. Default values are shown.")
            OutlinedButton(onClick = { onEvent(SettingsEvent.InitializeDefaults) }, enabled = !state.busy && state.error == null) { Text("Create default settings") }
        }
        state.message?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.primary) } }
        items(fields, key = { it.key }) { field ->
            val visible = !field.key.startsWith("studio.") || (!field.key.endsWith(".widthMm") && !field.key.endsWith(".heightMm")) || state.values[field.key.substringBeforeLast('.') + ".paper"] == "custom"
            if (visible) SettingsFieldEditor(field, state.values[field.key].orEmpty(), state.fieldErrors[field.key], enabled = !state.loading && !state.busy && !state.unavailable) { onEvent(SettingsEvent.Field(field.key, it)) }
        }
        when (state.section) {
            "general" -> item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                        Text("Client record maintenance" + (state.incompleteClientCount?.let { " · " + it + " incomplete" } ?: ""), style = MaterialTheme.typography.titleMedium)
                        Text("Fill missing public client IDs, transaction numbers and daily payable amounts. Existing numbers and payment references are preserved.")
                        OutlinedButton(onClick = { onEvent(SettingsEvent.CompleteRecords) }, enabled = !state.busy && !state.loading && !state.unavailable && state.incompleteClientCount != 0) { Text("Complete existing client records") }
                    }
                }
            }
            "index" -> item { Text("“Borrower's copy” stays fixed. Each paying date occupies one numbered slot; receipts on the same date are combined. Signature spaces remain blank.", style = MaterialTheme.typography.bodySmall) }
            "promissory" -> item { Text("Client principal, release date, name, address, loan term, amount in words and daily amount are inserted automatically. Valid ID, ID number, co-maker and signatures remain blank. The other clauses are retained.", style = MaterialTheme.typography.bodySmall) }
            "studio" -> item { Text("Index template proportions begin at 238 × 122 mm for 45 days and grow for longer terms. The note keeps its original A4 size and 12.7 mm margins. These saved defaults apply across sessions; individual print jobs can override them.", style = MaterialTheme.typography.bodySmall) }
        }
        item {
            Text(if (state.dirty) "You have unsaved changes" else "All changes saved", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                Button(onClick = { onEvent(SettingsEvent.Save) }, modifier = Modifier.weight(1f), enabled = !state.loading && !state.busy && !state.unavailable && state.dirty && !state.conflict) { Text(if (state.busy) "Saving…" else "Save settings") }
                OutlinedButton(onClick = { onEvent(SettingsEvent.Discard) }, modifier = Modifier.weight(1f), enabled = !state.busy) { Text("Discard changes") }
            }
            TextButton(onClick = { onEvent(SettingsEvent.RestoreDefaults) }, enabled = !state.busy && !state.loading) { Text("Restore defaults") }
        }
    }
}

@Composable
private fun SettingsFieldEditor(field: SettingField, value: String, error: String?, enabled: Boolean, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
        when (field.kind) {
            "boolean" -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(field.label, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Switch(checked = value == "true", onCheckedChange = { onChange(it.toString()) }, enabled = enabled)
            }
            "choice" -> {
                Text(field.label, style = MaterialTheme.typography.titleMedium)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    items(field.choices, key = { it.first }) { (key, label) -> FilterChip(selected = key == value, onClick = { onChange(key) }, enabled = enabled, label = { Text(label) }) }
                }
            }
            else -> OutlinedTextField(
                value = value, onValueChange = onChange, modifier = Modifier.fillMaxWidth(),
                label = { Text(field.label) }, enabled = enabled, isError = error != null,
                singleLine = field.kind != "multiline",
                supportingText = if (error != null) { { Text(error) } } else if (field.hint.isNotBlank()) { { Text(field.hint) } } else null,
                keyboardOptions = KeyboardOptions(keyboardType = when (field.kind) { "integer" -> KeyboardType.Number; "decimal" -> KeyboardType.Decimal; "phone" -> KeyboardType.Phone; "color" -> KeyboardType.Ascii; else -> KeyboardType.Text }),
            )
        }
        if (field.kind in listOf("choice", "boolean")) {
            if (field.hint.isNotBlank()) Text(field.hint, style = MaterialTheme.typography.bodySmall)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
