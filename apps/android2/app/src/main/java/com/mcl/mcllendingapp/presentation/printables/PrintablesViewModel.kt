package com.mcl.mcllendingapp.presentation.printables

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.DocumentRequest
import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.model.PrintSelection
import com.mcl.mcllendingapp.domain.model.PrintSelectionOverride
import com.mcl.mcllendingapp.domain.usecase.printables.DiscardDocumentUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.ExportDocumentUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.ObservePrintableClientsUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.ObservePrintSettingsUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.PrepareDocumentUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.SaveDocumentUseCase
import com.mcl.mcllendingapp.domain.usecase.printables.ValidatePrintLayoutUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive

/** Holds print selection, physical layout, bounded previews and explicit document output actions. */
@HiltViewModel
class PrintablesViewModel @Inject constructor(
    private val observeClients: ObservePrintableClientsUseCase,
    private val observeSettings: ObservePrintSettingsUseCase,
    private val prepareDocument: PrepareDocumentUseCase,
    private val exportDocument: ExportDocumentUseCase,
    private val saveDocument: SaveDocumentUseCase,
    private val discardDocument: DiscardDocumentUseCase,
    private val validateLayout: ValidatePrintLayoutUseCase
) : ViewModel() {
    private val state = MutableStateFlow(PrintablesUiState())
    val uiState = state.asStateFlow()
    private val query = MutableStateFlow(ListQuery())
    private var previewJob: Job? = null
    private var initialized = false
    private var lastClientPage: com.mcl.mcllendingapp.domain.model.Page<com.mcl.mcllendingapp.domain.model.Client>? = null
    private val collector = MutableStateFlow(false)
    private val feedEpoch = MutableStateFlow(0)

    init {
        viewModelScope.launch {
            combine(state.subscriptionCount.map { it > 0 }.distinctUntilChanged(), collector, feedEpoch) { visible, mode, _ -> visible to mode }.collectLatest { (visible, collectorMode) ->
                if (visible) coroutineScope {
                    launch {
                        var date = com.mcl.mcllendingapp.domain.model.LoanMath.today()
                        while (isActive) {
                            delay(60_000)
                            val next = com.mcl.mcllendingapp.domain.model.LoanMath.today()
                            if (next != date) { date = next; state.update { it.copy(clockRevision = it.clockRevision + 1) }; if (state.value.date.isBlank()) refreshPreview() }
                        }
                    }
                    launch {
                        try {
                            if (collectorMode) {
                                state.update { it.copy(settings = com.mcl.mcllendingapp.domain.model.AppSettings(), settingsAvailable = true) }
                                refreshPreview()
                            }
                            else observeSettings().collect { settings ->
                                state.update { it.copy(settings = settings, settingsAvailable = true) }
                                refreshPreview()
                            }
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (error: Exception) { state.update { it.copy(loading = false, settingsAvailable = false, error = error.message ?: "Document settings are unavailable.") } }
                    }
                    launch {
                        query.collectLatest { request ->
                            state.update { it.copy(loading = true) }
                            try {
                                observeClients(request).collect { page ->
                                    val changed = page != lastClientPage
                                    lastClientPage = page
                                    state.update { previous ->
                                        val selection = if (!initialized && previous.documentSelection.ids.isEmpty()) {
                                            initialized = true
                                            previous.documentSelection.copy(ids = page.items.firstOrNull()?.let { setOf(it.id) }.orEmpty())
                                        } else previous.documentSelection
                                        previous.copy(clients = page.items.toList(), totalClients = page.total, page = page.page, pageSize = page.pageSize,
                                            documentSelection = selection, loading = false)
                                    }
                                    if (changed || state.value.preview == null) refreshPreview()
                                }
                            } catch (cancelled: CancellationException) { throw cancelled }
                            catch (error: Exception) { state.update { it.copy(loading = false, error = error.message ?: "Clients could not be loaded.") } }
                        }
                    }
                }
            }
        }
    }

    fun onEvent(event: PrintablesEvent) {
        val current = state.value
        when (event.action) {
            PrintablesAction.COLLECTOR_MODE -> { collector.value = event.enabled; state.update { it.copy(collectorMode = event.enabled, printingMode = !event.enabled, kind = "index") } }
            PrintablesAction.CLIENT_PICKER -> state.update { it.copy(clientPicker = event.enabled, options = false) }
            PrintablesAction.OUTPUT_ERROR -> { current.artifact?.let(discardDocument::invoke); state.update { it.copy(artifact = null, destinationOpened = false, outputAction = "", error = event.text) } }
            PrintablesAction.INITIAL_CLIENT -> if (event.text.isNotBlank()) {
                initialized = true
                state.update { it.copy(documentSelection = PrintSelection(ids = setOf(event.text)), previewIndex = 0) }
                refreshPreview()
            }
            PrintablesAction.SEARCH -> {
                state.update { it.copy(search = event.text, page = 0) }
                query.value = query.value.copy(search = event.text, page = 0)
            }
            PrintablesAction.PAGE -> query.value = query.value.copy(page = event.number.toInt().coerceAtLeast(0))
            PrintablesAction.DOCUMENT -> {
                if (current.collectorMode && event.text != "index") return
                state.update { it.copy(kind = event.text, previewIndex = 0, preview = null, error = null, message = null) }
                refreshPreview()
            }
            PrintablesAction.MODE -> if (!current.collectorMode) state.update { it.copy(printingMode = event.enabled, options = false, error = null, message = null) }
            PrintablesAction.CLIENT -> {
                val selection = current.selection
                val client = current.clients.firstOrNull { it.id == event.text }
                val selected = client?.let(selection::includes) ?: (event.text in selection.ids)
                updateSelection(if (!selection.bulk) PrintSelection(ids = setOf(event.text)) else
                    selection.copy(overrides = selection.overrides + PrintSelectionOverride(!selected, clientId = event.text,
                        clientSearchText = client?.let(selection::searchText) ?: event.text)))
            }
            PrintablesAction.BULK -> updateSelection(if (event.enabled) current.selection.copy(bulk = true) else
                PrintSelection(ids = current.clients.firstOrNull { current.selection.includes(it) }?.let { setOf(it.id) } ?: current.selection.explicitIds.firstOrNull()?.let { setOf(it) }.orEmpty()))
            PrintablesAction.SELECT_MATCHES -> updateSelection(current.selection.copy(bulk = true,
                overrides = current.selection.overrides + PrintSelectionOverride(!current.selection.coversQuery(current.search), query = current.search)))
            PrintablesAction.CLEAR -> updateSelection(PrintSelection(bulk = true))
            PrintablesAction.DATE -> { state.update { it.copy(date = event.text, previewIndex = 0) }; refreshPreview() }
            PrintablesAction.RESET -> {
                state.update { it.copy(layouts = it.layouts - it.kind, numericInputs = it.numericInputs.filterKeys { key -> !key.startsWith(it.kind + ":") }, layoutErrors = emptyMap(), date = "", grid = true, zoom = 75, error = null, message = "Print options reset to saved defaults.") }
                refreshPreview()
            }
            PrintablesAction.GRID -> state.update { it.copy(grid = event.enabled) }
            PrintablesAction.ZOOM -> state.update { it.copy(zoom = event.number.toInt()) }
            PrintablesAction.OPTIONS -> if (!current.collectorMode) state.update { it.copy(options = event.enabled, clientPicker = false) }
            PrintablesAction.PAPER, PrintablesAction.ORIENTATION, PrintablesAction.WIDTH, PrintablesAction.HEIGHT,
            PrintablesAction.MARGIN, PrintablesAction.FONT_SIZE -> {
                val layout = current.layout
                val next = when (event.action) {
                    PrintablesAction.PAPER -> layout.copy(paper = event.text)
                    PrintablesAction.ORIENTATION -> layout.copy(orientation = event.text)
                    PrintablesAction.WIDTH -> layout.copy(widthMm = event.text.toDoubleOrNull() ?: Double.NaN)
                    PrintablesAction.HEIGHT -> layout.copy(heightMm = event.text.toDoubleOrNull() ?: Double.NaN)
                    PrintablesAction.MARGIN -> layout.copy(marginMm = event.text.toDoubleOrNull() ?: Double.NaN)
                    else -> layout.copy(fontSize = event.text.toDoubleOrNull() ?: Double.NaN)
                }
                state.update { it.copy(layouts = it.layouts + (it.kind to next), previewIndex = 0, layoutErrors = validateLayout(next),
                    numericInputs = if (event.action in listOf(PrintablesAction.WIDTH, PrintablesAction.HEIGHT, PrintablesAction.MARGIN, PrintablesAction.FONT_SIZE)) it.numericInputs + (it.kind + ":" + event.action.name to event.text) else it.numericInputs) }
                refreshPreview()
            }
            PrintablesAction.PREVIEW -> { feedEpoch.value++; refreshPreview() }
            PrintablesAction.PREVIOUS_PREVIEW -> { state.update { it.copy(previewIndex = (it.previewIndex - 1).coerceAtLeast(0)) }; refreshPreview() }
            PrintablesAction.NEXT_PREVIEW -> { state.update { it.copy(previewIndex = (it.previewIndex + 1).coerceAtMost((it.preview?.positions ?: 1) - 1)) }; refreshPreview() }
            PrintablesAction.PREVIEW_READY -> state.update {
                if (!it.previewLoading && event.number.toInt() == it.previewGeneration) it.copy(previewReady = true, overflow = event.enabled) else it
            }
            PrintablesAction.PRINT, PrintablesAction.PDF, PrintablesAction.HTML, PrintablesAction.DOCX -> output(event.action)
            PrintablesAction.RETRY_DESTINATION -> state.update { it.copy(destinationOpened = false, destinationAttempt = it.destinationAttempt + 1) }
            PrintablesAction.DESTINATION_OPENED -> state.update { it.copy(destinationOpened = true) }
            PrintablesAction.DESTINATION_RESULT -> save(event.text)
            PrintablesAction.ARTIFACT_CONSUMED -> {
                current.artifact?.let(discardDocument::invoke)
                state.update { it.copy(artifact = null, destinationOpened = false, outputAction = "") }
            }
            PrintablesAction.DISMISS_MESSAGE -> state.update { it.copy(message = null, error = null) }
        }
    }

    private fun updateSelection(selection: PrintSelection) {
        state.update { if (it.kind == "summary") it.copy(summarySelection = selection, previewIndex = 0) else it.copy(documentSelection = selection, previewIndex = 0, clientPicker = it.clientPicker && selection.bulk) }
        refreshPreview()
    }

    private fun request() = state.value.let { DocumentRequest(it.kind, it.selection, it.layout, it.settings, it.collectionDate, it.previewIndex) }

    private fun refreshPreview() {
        if (!state.value.settingsAvailable) return
        previewJob?.cancel()
        state.update { it.copy(previewLoading = true, previewReady = false, overflow = false, error = null, previewGeneration = it.previewGeneration + 1) }
        previewJob = viewModelScope.launch {
            delay(250)
            try {
                val preview = prepareDocument(request())
                state.update { it.copy(preview = preview, previewIndex = preview.position, previewLoading = false, previewReady = false, overflow = false, previewGeneration = it.previewGeneration + 1) }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { state.update { it.copy(preview = null, previewLoading = false, error = error.message ?: "The document preview could not be prepared.") } }
        }
    }

    private fun output(action: PrintablesAction) {
        if (!state.value.canExport || ((action == PrintablesAction.PRINT || action == PrintablesAction.PDF) && (!state.value.previewReady || state.value.overflow))) return
        val documentRequest = request()
        state.update { it.copy(busy = true, error = null, message = null) }
        viewModelScope.launch {
            try {
                val artifact = exportDocument(documentRequest, if (action == PrintablesAction.DOCX) "docx" else "html")
                state.update { it.copy(busy = false, artifact = artifact, outputAction = action.name, destinationOpened = false,
                    message = if (action == PrintablesAction.PDF) "Choose Save as PDF in the Android print dialog." else null) }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { state.update { it.copy(busy = false, error = error.message ?: "The document could not be exported.") } }
        }
    }

    private fun save(destination: String) {
        val artifact = state.value.artifact ?: return
        if (destination.isBlank()) { onEvent(PrintablesEvent(PrintablesAction.ARTIFACT_CONSUMED)); return }
        viewModelScope.launch {
            state.update { it.copy(busy = true) }
            try {
                saveDocument(artifact, destination)
                discardDocument(artifact)
                state.update { it.copy(busy = false, artifact = null, destinationOpened = false, message = "Document saved.", outputAction = "") }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (error: Exception) { state.update { it.copy(busy = false, destinationOpened = false, error = error.message ?: "The document could not be saved.") } }
        }
    }

    override fun onCleared() {
        state.value.artifact?.let(discardDocument::invoke)
        super.onCleared()
    }
}
