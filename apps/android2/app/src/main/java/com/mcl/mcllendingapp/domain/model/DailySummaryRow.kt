package com.mcl.mcllendingapp.domain.model

data class DailySummaryRow(val client: Client, val transactionNumber: String = "",
    val amount: Double = 0.0, val collectors: String = "", val notes: String = "")
