package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class ReceiptAttempt(val id: String, val payment: Payment, val ownerUid: String,
    val error: String? = null)
