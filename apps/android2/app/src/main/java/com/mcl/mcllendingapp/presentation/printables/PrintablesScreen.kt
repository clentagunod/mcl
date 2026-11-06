package com.mcl.mcllendingapp.presentation.printables

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.FormField
import com.mcl.mcllendingapp.presentation.components.PageControls
import com.mcl.mcllendingapp.ui.theme.AppDimensions
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.util.documents.DocumentDestinationContract
import com.mcl.mcllendingapp.util.documents.DocumentPrintController
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.coroutines.CancellationException

@Composable
fun PrintablesScreen(
    initialClientId: String? = null,
    onSettings: () -> Unit = {},
    expanded: Boolean = false,
    collectorMode: Boolean = false,
    viewModel: PrintablesViewModel = hiltViewModel()
) {
    var configured by remember(collectorMode) { mutableStateOf(false) }
    LaunchedEffect(collectorMode) { viewModel.onEvent(PrintablesEvent(PrintablesAction.COLLECTOR_MODE, enabled = collectorMode)); configured = true }
    if (!configured) { LinearProgressIndicator(Modifier.fillMaxWidth()); return }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val printer = remember(context) { DocumentPrintController(context) }
    val destination = rememberLauncherForActivityResult(DocumentDestinationContract()) { uri ->
        viewModel.onEvent(PrintablesEvent(PrintablesAction.DESTINATION_RESULT, text = uri?.toString().orEmpty()))
    }
    DisposableEffect(printer) { onDispose { printer.close() } }
    LaunchedEffect(initialClientId) { initialClientId?.let { viewModel.onEvent(PrintablesEvent(PrintablesAction.INITIAL_CLIENT, text = it)) } }
    LaunchedEffect(state.artifact?.path, state.destinationAttempt) {
        val artifact = state.artifact
        if (artifact != null && !state.destinationOpened) {
            viewModel.onEvent(PrintablesEvent(PrintablesAction.DESTINATION_OPENED))
            if (state.outputAction == PrintablesAction.PRINT.name || state.outputAction == PrintablesAction.PDF.name) {
                try {
                    printer.print(artifact)
                    viewModel.onEvent(PrintablesEvent(PrintablesAction.ARTIFACT_CONSUMED))
                } catch (cancelled: CancellationException) { viewModel.onEvent(PrintablesEvent(PrintablesAction.ARTIFACT_CONSUMED)); throw cancelled }
                catch (error: Exception) { viewModel.onEvent(PrintablesEvent(PrintablesAction.OUTPUT_ERROR, text = error.message ?: "The print service is unavailable.")) }
            } else destination.launch(artifact)
        }
    }
    PrintablesContent(state, viewModel::onEvent, onSettings, expanded)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrintablesContent(state: PrintablesUiState, onEvent: (PrintablesEvent) -> Unit, onSettings: () -> Unit, expanded: Boolean = false) {
    var chooseDate by rememberSaveable { mutableStateOf(false) }
    val controls: LazyListScope.() -> Unit = {
        item("heading") {
            Text("Print studio", style = MaterialTheme.typography.headlineMedium)
            Text("Choose a document and clients, then review and finish.", style = MaterialTheme.typography.bodyMedium)
        }
        if (!state.collectorMode) item("mode") {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                FilterChip(state.printingMode, { onEvent(PrintablesEvent(PrintablesAction.MODE, enabled = true)) }, { Text("Printing Mode") })
                FilterChip(!state.printingMode, { onEvent(PrintablesEvent(PrintablesAction.MODE, enabled = false)) }, { Text("View Only") })
            }
        }
        item("document") {
            Text("1 · Choose a document", style = MaterialTheme.typography.titleMedium)
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                (if (state.collectorMode) listOf("index" to "Index Card") else listOf("index" to "Index Card", "promissory" to "Promissory Note", "summary" to "Daily Summary Sheet")).forEach { (kind, title) ->
                    FilterChip(state.kind == kind, { onEvent(PrintablesEvent(PrintablesAction.DOCUMENT, text = kind)) }, { Text(title) })
                }
            }
        }
        item("messages") {
            if (state.loading || state.previewLoading || state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { error ->
                Card { Column(Modifier.padding(AppSpacing.medium)) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    TextButton({ onEvent(PrintablesEvent(PrintablesAction.PREVIEW)) }) { Text("Retry") }
                } }
            }
            state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        }
        item("clients-heading") {
            Text("2 · Choose clients", style = MaterialTheme.typography.titleMedium)
            Text((state.preview?.selectedCount?.toString() ?: "—") + " selected", style = MaterialTheme.typography.bodyMedium)
            OutlinedButton({ onEvent(PrintablesEvent(PrintablesAction.CLIENT_PICKER, enabled = true)) }) { Text("Choose clients") }
        }
        item("document-options") {
            if (state.kind == "summary") {
                OutlinedTextField(state.collectionDate, {}, readOnly = true, label = { Text("Collection date") }, modifier = Modifier.fillMaxWidth(),
                    trailingIcon = { TextButton({ chooseDate = true }) { Text("Choose") } })
                Text("Includes checked clients, including zero collections. Multiple collectors and notes are retained.", style = MaterialTheme.typography.bodySmall)
            } else Text(if (state.kind == "index") "One sequential slot per paying date. Missed dates create no gaps; signatures stay blank."
                else "Client details fill the original note. Co-maker, ID details and signatures remain blank.", style = MaterialTheme.typography.bodySmall)
            if (state.printingMode) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    OutlinedButton({ onEvent(PrintablesEvent(PrintablesAction.OPTIONS, enabled = true)) }) { Text("Paper & layout") }
                    TextButton(onSettings) { Text("Template settings") }
                    TextButton({ onEvent(PrintablesEvent(PrintablesAction.RESET)) }, enabled = !state.busy) { Text("Reset print options") }
                }
            }
        }
    }
    val previewContent: LazyListScope.() -> Unit = {
        item("preview-heading") {
            Text(if (state.printingMode) "3 · Review & finish" else "Document preview", style = MaterialTheme.typography.titleMedium)
            TextButton({ onEvent(PrintablesEvent(PrintablesAction.PREVIEW)) }, enabled = !state.previewLoading && !state.busy) { Text("Refresh preview") }
            state.preview?.let { preview ->
                Text(preview.pageCount.toString() + " pages · " + preview.selectedCount + " clients · " + preview.widthMm + " × " + preview.heightMm + " mm",
                    style = MaterialTheme.typography.bodySmall)
                if (preview.cached) Text("Cached data. Connect and refresh before exporting.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                Switch(state.grid, { onEvent(PrintablesEvent(PrintablesAction.GRID, enabled = it)) })
                Text("Size grid · preview only", Modifier.padding(vertical = AppSpacing.small), style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                listOf(40, 50, 60, 75, 100, 125).forEach { zoom ->
                    FilterChip(state.zoom == zoom, { onEvent(PrintablesEvent(PrintablesAction.ZOOM, number = zoom.toDouble())) }, { Text(zoom.toString() + "%") })
                }
            }
        }
        item("preview") {
            val preview = state.preview
            if (preview != null && preview.selectedCount > 0) DocumentPreview(preview, state.zoom, state.grid, state.previewGeneration) { overflow ->
                onEvent(PrintablesEvent(PrintablesAction.PREVIEW_READY, enabled = overflow, number = state.previewGeneration.toDouble()))
            } else if (!state.previewLoading) Text("Choose a client and valid paper settings to preview.")
        }
        item("preview-pages") {
            state.preview?.takeIf { it.positions > 1 }?.let { preview ->
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    TextButton({ onEvent(PrintablesEvent(PrintablesAction.PREVIOUS_PREVIEW)) }, enabled = preview.position > 0 && !state.previewLoading) { Text("Previous preview") }
                    Text((preview.position + 1).toString() + " / " + preview.positions, Modifier.padding(AppSpacing.small))
                    TextButton({ onEvent(PrintablesEvent(PrintablesAction.NEXT_PREVIEW)) }, enabled = preview.position + 1 < preview.positions && !state.previewLoading) { Text("Next preview") }
                }
                Text("Preview is paged. Printing and exports include every selected client.", style = MaterialTheme.typography.bodySmall)
            }
        }
        item("output") {
            if (state.artifact != null && !state.destinationOpened) Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                TextButton({ onEvent(PrintablesEvent(PrintablesAction.RETRY_DESTINATION)) }) { Text("Choose another destination") }
                TextButton({ onEvent(PrintablesEvent(PrintablesAction.ARTIFACT_CONSUMED)) }) { Text("Cancel export") }
            }
            if (state.overflow) Text("Content exceeds the selected paper size. Increase paper size, reduce font or margins, or shorten the template. HTML and Word retain all content.", color = MaterialTheme.colorScheme.error)
            if (state.printingMode) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    Button({ onEvent(PrintablesEvent(PrintablesAction.PRINT)) }, enabled = state.canExport && state.previewReady && !state.overflow) { Text("Print") }
                    OutlinedButton({ onEvent(PrintablesEvent(PrintablesAction.PDF)) }, enabled = state.canExport && state.previewReady && !state.overflow) { Text("Save PDF") }
                }
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    OutlinedButton({ onEvent(PrintablesEvent(PrintablesAction.DOCX)) }, enabled = state.canExport) { Text(if ((state.preview?.selectedCount ?: 0) > 1 && state.kind != "summary") "Export DOCX bundle" else "Export DOCX") }
                    OutlinedButton({ onEvent(PrintablesEvent(PrintablesAction.HTML)) }, enabled = state.canExport) { Text("Export HTML") }
                }
                Text("Save PDF opens Android printing. Match the paper size and use 100% scale. Word may reflow content; PDF preserves the document layout.", style = MaterialTheme.typography.bodySmall)
            } else Text("View Only uses the same document layout. Client and date choices only change this preview.", style = MaterialTheme.typography.bodySmall)
        }
    }
    if (expanded) Row(Modifier.padding(AppSpacing.medium), horizontalArrangement = Arrangement.spacedBy(AppSpacing.large)) {
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(AppSpacing.small), content = controls)
        LazyColumn(Modifier.weight(1.5f), verticalArrangement = Arrangement.spacedBy(AppSpacing.small), content = previewContent)
    } else LazyColumn(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) { controls(); previewContent() }
    if (state.clientPicker) ModalBottomSheet(onDismissRequest = { onEvent(PrintablesEvent(PrintablesAction.CLIENT_PICKER, enabled = false)) }) {
        PrintClientPicker(state, onEvent)
    }
    if (state.options && state.printingMode) ModalBottomSheet(onDismissRequest = { onEvent(PrintablesEvent(PrintablesAction.OPTIONS, enabled = false)) }) {
        PrintPaperOptions(state, onEvent)
    }
    if (chooseDate) {
        val selected = runCatching { LocalDate.parse(state.collectionDate).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
        val datePicker = rememberDatePickerState(initialSelectedDateMillis = selected, selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean = utcTimeMillis <= state.latestDateUtcMillis
        })
        DatePickerDialog(onDismissRequest = { chooseDate = false },
            confirmButton = { TextButton({
                datePicker.selectedDateMillis?.let { onEvent(PrintablesEvent(PrintablesAction.DATE, text = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString())) }
                chooseDate = false
            }, enabled = datePicker.selectedDateMillis != null) { Text("Choose date") } },
            dismissButton = { TextButton({ chooseDate = false }) { Text("Cancel") } }) { DatePicker(datePicker) }
    }
}

@Composable
private fun PrintPaperOptions(state: PrintablesUiState, onEvent: (PrintablesEvent) -> Unit) {
    LazyColumn(modifier = Modifier.fillMaxWidth().widthIn(max = AppDimensions.fieldMaxWidth).padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
        item { Text("Paper & layout", style = MaterialTheme.typography.titleLarge) }
        item {
            Text("Paper size")
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                listOf("template" to "Template", "a4" to "A4", "letter" to "Letter", "legal" to "Legal", "custom" to "Custom").forEach { (paper, title) ->
                    FilterChip(state.layout.paper == paper, { onEvent(PrintablesEvent(PrintablesAction.PAPER, text = paper)) }, { Text(title) })
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                listOf("portrait", "landscape").forEach { orientation ->
                    FilterChip(state.layout.orientation == orientation, { onEvent(PrintablesEvent(PrintablesAction.ORIENTATION, text = orientation)) }, { Text(orientation.replaceFirstChar { it.uppercase() }) })
                }
            }
        }
        if (state.layout.paper == "custom") {
            item { FormField("Width (mm) · 70–600", state.numericValue("WIDTH", state.layout.widthMm), { onEvent(PrintablesEvent(PrintablesAction.WIDTH, text = it)) }, error = state.layoutErrors["WIDTH"], keyboard = KeyboardType.Decimal) }
            item { FormField("Height (mm) · 70–600", state.numericValue("HEIGHT", state.layout.heightMm), { onEvent(PrintablesEvent(PrintablesAction.HEIGHT, text = it)) }, error = state.layoutErrors["HEIGHT"], keyboard = KeyboardType.Decimal) }
        }
        item { FormField("Margin (mm) · 0–30", state.numericValue("MARGIN", state.layout.marginMm), { onEvent(PrintablesEvent(PrintablesAction.MARGIN, text = it)) }, error = state.layoutErrors["MARGIN"], keyboard = KeyboardType.Decimal) }
        item { FormField("Font size (pt) · 6–18, steps of 0.5", state.numericValue("FONT_SIZE", state.layout.fontSize), { onEvent(PrintablesEvent(PrintablesAction.FONT_SIZE, text = it)) }, error = state.layoutErrors["FONT_SIZE"], keyboard = KeyboardType.Decimal) }
        item { Text("Changes apply to this print session. Shared defaults are in Template settings.", style = MaterialTheme.typography.bodySmall) }
        item { Button({ onEvent(PrintablesEvent(PrintablesAction.OPTIONS, enabled = false)) }) { Text("Done") } }
    }
}

@Composable
private fun PrintClientPicker(state: PrintablesUiState, onEvent: (PrintablesEvent) -> Unit) {
    LazyColumn(Modifier.fillMaxWidth().padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
        item("done") { TextButton({ onEvent(PrintablesEvent(PrintablesAction.CLIENT_PICKER, enabled = false)) }) { Text("Done") } }
        item("clients-heading") {
            Text("2 · Choose clients", style = MaterialTheme.typography.titleMedium)
            FormField("Search clients", state.search, { onEvent(PrintablesEvent(PrintablesAction.SEARCH, text = it)) })
            Text("Name, client ID or transaction number. Search keeps your selections.", style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                Checkbox(state.selection.bulk, { onEvent(PrintablesEvent(PrintablesAction.BULK, enabled = it)) })
                Text("Bulk printing", Modifier.padding(vertical = AppSpacing.small))
            }
            if (state.selection.bulk) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                TextButton({ onEvent(PrintablesEvent(PrintablesAction.SELECT_MATCHES)) }) { Text(if (state.selection.coversQuery(state.search)) "Deselect all matches" else "Select all matches") }
                TextButton({ onEvent(PrintablesEvent(PrintablesAction.CLEAR)) }) { Text("Clear selection") }
            }
            Text((state.preview?.selectedCount?.toString() ?: "—") + " selected · " + state.totalClients + " matches",
                style = MaterialTheme.typography.labelMedium)
        }
        if (!state.loading && state.clients.isEmpty()) item("empty-clients") { Text(if (state.search.isBlank()) "Add a client to start preparing documents." else "No clients match your search. Your selection is kept.") }
        items(state.clients, key = { it.id }) { client ->
            val selected = state.selection.includes(client)
            Card(Modifier.fillMaxWidth().clickable { onEvent(PrintablesEvent(PrintablesAction.CLIENT, text = client.id)) }) {
                Row(Modifier.padding(AppSpacing.small), horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    if (state.selection.bulk) Checkbox(selected, null) else RadioButton(selected, null)
                    Column {
                        Text(client.lastName + ", " + client.firstName + " " + client.middleName, style = MaterialTheme.typography.titleSmall)
                        Text(client.clientNumber.ifBlank { client.id } + " · Txn " + client.transactionNumber.ifBlank { "Pending" }, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        item("client-pages") { PageControls(state.page, state.pageSize, state.totalClients, { onEvent(PrintablesEvent(PrintablesAction.PAGE, number = it.toDouble())) }) }
    }
}
