package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class Payment(
    val id: String = "", val clientId: String = "", val loanId: String = "initial",
    val amount: Double = 0.0, val paymentDate: String = "", val collectorId: String = "",
    val collectorName: String = "", val notes: String = "", val createdAt: Long? = null,
    val indexDay: Int? = null,
)
