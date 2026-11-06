package com.mcl.mcllendingapp.presentation.dashboard

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.DashboardStats

@Immutable
data class DashboardUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val fresh: Boolean = false,
    val today: String = "",
    val lastSynced: Long? = null,
    val days: Int = 14,
    val selectedDate: String = "",
    val selectedIndex: Int = 0,
    val points: List<DailyCollectionPoint> = emptyList(),
    val periodAmount: Double = 0.0,
    val periodReceipts: Int = 0,
    val stats: DashboardStats = DashboardStats(),
    val segments: List<LoanStatusSegment> = emptyList(),
    val collectorActivity: List<CollectorActivityItem> = emptyList(),
    val recentLimit: Int = 15,
    val dueLimit: Int = 10,
)
