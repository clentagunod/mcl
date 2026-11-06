package com.mcl.mcllendingapp.presentation.consolidation

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.CollectionDay
import com.mcl.mcllendingapp.domain.model.Page

@Immutable
data class LedgerDetailUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val client: Client? = null,
    val totalPayment: Double = 0.0,
    val principal: Double = 0.0,
    val balance: Double = 0.0,
    val totalPayingDays: Int = 0,
    val matrix: List<LedgerDayItem> = emptyList(),
    val history: Page<CollectionDay> = Page(),
    val historyItems: List<LedgerDayItem> = emptyList(),
    val historyLoading: Boolean = false,
    val historyError: String? = null,
)
