package com.mcl.mcllendingapp.presentation.consolidation

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.ConsolidationRow
import com.mcl.mcllendingapp.domain.model.Page

@Immutable
data class ConsolidationUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val search: String = "",
    val term: String = "all",
    val sort: String = "default",
    val page: Page<ConsolidationRow> = Page(),
    val totalPayment: Double = 0.0,
    val totalPrincipal: Double = 0.0,
    val totalBalance: Double = 0.0,
    val collectedPercent: Double = 0.0,
    val progress: Float = 0f,
    val selectedId: String? = null,
    val ledgerTab: String = "matrix",
    val historyPage: Int = 0,
    val detail: LedgerDetailUiState = LedgerDetailUiState(),
)
