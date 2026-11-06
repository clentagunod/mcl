package com.mcl.mcllendingapp.presentation.printables

import androidx.lifecycle.ViewModelStore
import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.model.DocumentPreview
import com.mcl.mcllendingapp.domain.model.DocumentRequest
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import com.mcl.mcllendingapp.domain.usecase.printables.*
import java.lang.reflect.Proxy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PrintablesViewModelTest {
    @Test fun changesDisableExportImmediatelyAndIgnoreOldPreviewMeasurements() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val documents = FakeDocuments()
        val store = ViewModelStore()
        var collector: Job? = null
        try {
            val model = model(documents)
            store.put("print", model)
            collector = backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { model.uiState.collect() }
            runCurrent()
            advanceTimeBy(251)
            runCurrent()
            val generation = model.uiState.value.previewGeneration
            model.onEvent(PrintablesEvent(PrintablesAction.PREVIEW_READY, number = generation.toDouble()))
            assertTrue(model.uiState.value.canExport)
            assertTrue(model.uiState.value.previewReady)

            model.onEvent(PrintablesEvent(PrintablesAction.WIDTH, text = "300"))
            assertTrue(model.uiState.value.previewLoading)
            assertFalse(model.uiState.value.canExport)
            model.onEvent(PrintablesEvent(PrintablesAction.PREVIEW_READY, number = generation.toDouble()))
            assertFalse(model.uiState.value.previewReady)
            model.onEvent(PrintablesEvent(PrintablesAction.HTML))
            runCurrent()
            assertTrue(documents.exports.isEmpty())

            advanceTimeBy(251)
            runCurrent()
            val ready = model.uiState.value
            model.onEvent(PrintablesEvent(PrintablesAction.PREVIEW_READY, number = ready.previewGeneration.toDouble()))
            assertTrue(model.uiState.value.previewReady)
            assertTrue(model.uiState.value.canExport)
        } finally {
            collector?.cancel()
            store.clear()
            runCurrent()
            Dispatchers.resetMain()
        }
    }

    @Test fun exportCapturesTheChosenDocumentAndRejectsDuplicateActions() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        val documents = FakeDocuments()
        val store = ViewModelStore()
        var collector: Job? = null
        try {
            val model = model(documents)
            store.put("print", model)
            collector = backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { model.uiState.collect() }
            runCurrent()
            advanceTimeBy(251)
            runCurrent()

            model.onEvent(PrintablesEvent(PrintablesAction.DOCX))
            assertTrue(model.uiState.value.busy)
            model.onEvent(PrintablesEvent(PrintablesAction.DOCX))
            model.onEvent(PrintablesEvent(PrintablesAction.DOCUMENT, text = "summary"))
            runCurrent()

            assertEquals(1, documents.exports.size)
            assertEquals("index", documents.exports.single().kind)
        } finally {
            collector?.cancel()
            store.clear()
            runCurrent()
            Dispatchers.resetMain()
        }
    }

    private fun model(documents: DocumentRepository): PrintablesViewModel {
        val repository = Proxy.newProxyInstance(AdminRepository::class.java.classLoader, arrayOf(AdminRepository::class.java)) { _, method, _ ->
            when (method.name) {
                "observeClients" -> flowOf(Page(listOf(Client(id = "client")), 1, 0, 25, true))
                "observeSettings" -> flowOf(AppSettings())
                else -> error("Unexpected repository access: " + method.name)
            }
        } as AdminRepository
        return PrintablesViewModel(
            ObservePrintableClientsUseCase(repository), ObservePrintSettingsUseCase(repository),
            PrepareDocumentUseCase(documents), ExportDocumentUseCase(documents), SaveDocumentUseCase(documents),
            DiscardDocumentUseCase(documents), ValidatePrintLayoutUseCase()
        )
    }

    private class FakeDocuments : DocumentRepository {
        val exports = mutableListOf<DocumentRequest>()
        override suspend fun preview(request: DocumentRequest) = DocumentPreview("<html/>", 1, 210.0, 297.0, 1, 0, 1)
        override suspend fun export(request: DocumentRequest, format: String): DocumentArtifact {
            exports.add(request)
            return DocumentArtifact("temporary-document", "document.docx", "application/octet-stream")
        }
        override suspend fun save(artifact: DocumentArtifact, destination: String) = Unit
        override fun discard(artifact: DocumentArtifact) = Unit
    }
}
