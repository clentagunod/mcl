package com.mcl.mcllendingapp.presentation.consolidation

import androidx.compose.runtime.Immutable

@Immutable
data class LedgerDayItem(
    val day: Int,
    val date: String? = null,
    val amount: Double? = null,
    val receipts: Int = 0,
    val endpoint: Boolean = false,
    val afterTerm: Boolean = false,
)
