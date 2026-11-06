package com.mcl.mcllendingapp.presentation.printables

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.model.DocumentPreview
import com.mcl.mcllendingapp.domain.model.PrintLayout
import com.mcl.mcllendingapp.domain.model.PrintSelection
import java.time.LocalDate

@Immutable
data class PrintablesUiState(
    val clients: List<Client> = emptyList(),
    val totalClients: Int = 0,
    val page: Int = 0,
    val pageSize: Int = 25,
    val search: String = "",
    val kind: String = "index",
    val printingMode: Boolean = true,
    val collectorMode: Boolean = false,
    val clientPicker: Boolean = false,
    val documentSelection: PrintSelection = PrintSelection(),
    val summarySelection: PrintSelection = PrintSelection(matchingQueries = setOf(""), bulk = true),
    val layouts: Map<String, PrintLayout> = emptyMap(),
    val numericInputs: Map<String, String> = emptyMap(),
    val layoutErrors: Map<String, String> = emptyMap(),
    val settings: AppSettings = AppSettings(),
    val settingsAvailable: Boolean = false,
    val date: String = "",
    val clockRevision: Int = 0,
    val grid: Boolean = true,
    val zoom: Int = 75,
    val options: Boolean = false,
    val loading: Boolean = true,
    val previewLoading: Boolean = false,
    val busy: Boolean = false,
    val previewReady: Boolean = false,
    val previewGeneration: Int = 0,
    val overflow: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val preview: DocumentPreview? = null,
    val artifact: DocumentArtifact? = null,
    val outputAction: String = "",
    val destinationOpened: Boolean = false,
    val destinationAttempt: Int = 0,
    val previewIndex: Int = 0
) {
    val collectionDate: String get() = date.ifBlank { com.mcl.mcllendingapp.domain.model.LoanMath.today() }
    val latestDateUtcMillis: Long get() = LocalDate.parse(com.mcl.mcllendingapp.domain.model.LoanMath.today()).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()
    val status: com.mcl.mcllendingapp.domain.model.LoadState<DocumentPreview> get() = when {
        error != null -> com.mcl.mcllendingapp.domain.model.LoadState.Error(error)
        loading || previewLoading -> com.mcl.mcllendingapp.domain.model.LoadState.Loading
        preview == null || preview.selectedCount == 0 -> com.mcl.mcllendingapp.domain.model.LoadState.Empty
        else -> com.mcl.mcllendingapp.domain.model.LoadState.Success(preview)
    }
    val selection: PrintSelection get() = if (kind == "summary") summarySelection else documentSelection
    val layout: PrintLayout get() = layouts[kind] ?: settings.studio[kind] ?: AppSettings().studio.getValue(kind)
    val canExport: Boolean get() = printingMode && !collectorMode && settingsAvailable && !loading && !busy && !previewLoading && artifact == null && (preview?.selectedCount ?: 0) > 0 && preview?.cached == false && error == null
    fun numericValue(field: String, value: Double): String = numericInputs[kind + ":" + field] ?: if (!value.isFinite()) "" else if (value % 1 == 0.0) value.toLong().toString() else value.toString()
    val hasNextPage: Boolean get() = (page + 1) * pageSize < totalClients
}
