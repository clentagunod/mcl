package com.mcl.mcllendingapp.domain.model

data class ConsolidationRow(val client: Client, val days: List<CollectionDay> = emptyList(),
    val totalPayment: Double = 0.0, val principal: Double = 0.0, val balance: Double = 0.0, val totalPayingDays: Int = 0)
