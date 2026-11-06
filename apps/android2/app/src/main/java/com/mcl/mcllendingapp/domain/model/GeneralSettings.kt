package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class GeneralSettings(val businessName: String = "MCL Dashboard",
    val clientIdPrefix: String = "mcl", val clientIdDigits: Int = 4,
    val defaultPaymentNote: String = "Daily Payment", val recentPaymentsLimit: Int = 15,
    val dueClientsLimit: Int = 10)
