package com.mcl.mcllendingapp.util.documents

import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.Payment
import com.mcl.mcllendingapp.domain.model.PrintLayout

data class PrintJob(
    val kind: PrintDocumentKind,
    val clients: List<Client>,
    val payments: List<Payment>,
    val settings: AppSettings,
    val layout: PrintLayout,
    val date: String,
    val totalClients: Int = clients.size,
    val selectedClientCount: Int? = null,
    val grandTotal: Double? = null,
    val clientsWithCollections: Int? = null,
    val summaryPageNumber: Int? = null,
    val summaryPageCount: Int? = null,
    val startIndex: Int = 0,
    val includeGrandTotal: Boolean = true
)
