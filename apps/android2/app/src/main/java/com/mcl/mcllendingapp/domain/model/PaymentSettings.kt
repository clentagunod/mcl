package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class PaymentSettings(val enforceDailyMinimum: Boolean = false)
