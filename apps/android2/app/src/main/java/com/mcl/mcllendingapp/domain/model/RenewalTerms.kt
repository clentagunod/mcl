package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class RenewalTerms(val principal: Double, val interest: Double, val dailyAmount: Double,
    val loanTermDays: Int, val approvalDate: String)
