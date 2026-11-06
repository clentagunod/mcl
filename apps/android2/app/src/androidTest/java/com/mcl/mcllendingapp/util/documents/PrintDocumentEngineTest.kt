package com.mcl.mcllendingapp.util.documents

import androidx.test.platform.app.InstrumentationRegistry
import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.usecase.printables.BuildIndexPaymentDaysUseCase
import org.junit.Assert.assertEquals
import org.junit.Test

class PrintDocumentEngineTest {
    @Test fun prePaginatedSummaryKeepsItsPageNumberAndAllRowsOnOneSheet() {
        val engine = PrintDocumentEngine(InstrumentationRegistry.getInstrumentation().targetContext, BuildIndexPaymentDaysUseCase())
        val settings = AppSettings()
        val clients = (1..11).map { Client(id = "client-" + it.toString().padStart(2, '0'), lastName = "Family" + it, firstName = "A", transactionNumber = it.toString()) }
        val job = PrintJob(PrintDocumentKind.SUMMARY, clients, emptyList(), settings,
            settings.studio.getValue("summary").copy(fontSize = 18.0), "2026-11-05",
            summaryPageNumber = 2, summaryPageCount = 3, startIndex = 11, includeGrandTotal = false)

        val output = engine.render(job)

        assertEquals(1, output.pageCount)
        assertEquals(1, Regex("summary-sheet").findAll(output.html).count())
        assertEquals(1, Regex("Page 2 of 3").findAll(output.html).count())
        clients.forEach { client -> assertEquals(1, Regex(client.id).findAll(output.html).count()) }
    }
}
