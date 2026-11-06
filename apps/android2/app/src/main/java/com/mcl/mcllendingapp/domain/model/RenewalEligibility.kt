package com.mcl.mcllendingapp.domain.model

data class RenewalEligibility(val eligible: Boolean, val reason: String, val paidOn: String? = null,
    val dueDate: String = "", val totalPaid: Double = 0.0)
