package com.mcl.mcllendingapp.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.DashboardStats
import com.mcl.mcllendingapp.domain.usecase.auth.ObserveSyncUseCase
import com.mcl.mcllendingapp.domain.usecase.auth.RefreshUseCase
import com.mcl.mcllendingapp.domain.usecase.dashboard.ObserveDashboardUseCase
import com.mcl.mcllendingapp.domain.usecase.settings.ObserveSettingsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlin.math.roundToInt

/** Observes bounded dashboard aggregates and provides accessible daily chart selection. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class DashboardViewModel @Inject constructor(
    observeDashboard: ObserveDashboardUseCase,
    observeSync: ObserveSyncUseCase,
    observeSettings: ObserveSettingsUseCase,
    private val refreshWorkspace: RefreshUseCase,
) : ViewModel() {
    private val local = MutableStateFlow(DashboardUiState())
    private val retry = MutableStateFlow(0)
    private val businessDate = flow {
        while (true) {
            emit(LocalDate.now(ZoneId.of("Asia/Manila")).toString())
            delay(60_000)
        }
    }.distinctUntilChanged()
    private val source = combine(businessDate, retry) { date, _ -> date }.flatMapLatest { date ->
        observeDashboard(date)
            .map<DashboardStats, Triple<String, DashboardStats?, String?>> { Triple(date, it, null) }
            .onStart { emit(Triple(date, null, null)) }
            .catch { emit(Triple(date, null, it.message ?: "The dashboard could not load.")) }
    }
    private val settings = observeSettings().onStart { emit(com.mcl.mcllendingapp.domain.model.AppSettings()) }.catch { emit(com.mcl.mcllendingapp.domain.model.AppSettings()) }

    val uiState: StateFlow<DashboardUiState> = combine(local, source, observeSync(), settings) { draft, result, sync, settings ->
        val stats = result.second ?: DashboardStats()
        val points = collectionTrend(result.first, draft.days, stats.monthlyCollections, stats.dailyReceiptCounts)
        val selected = points.indexOfFirst { it.date == draft.selectedDate }.takeIf { it >= 0 } ?: points.lastIndex
        val segments = listOf(
            Triple("Due", stats.dueClients, "due"),
            Triple("Pending", stats.pendingClients, "pending"),
            Triple("Paid", stats.paidClients, "paid"),
        ).map { (label, count, tone) -> LoanStatusSegment(label, count, if (stats.totalClients > 0) (count * 100.0 / stats.totalClients).roundToInt() else 0, tone) }
        val activity = stats.collectorNames.map { (id, name) ->
            CollectorActivityItem(id, name, stats.collectorReceiptCounts[id] ?: 0, stats.collectorCollections[id] ?: 0.0, stats.collectorLastEntry[id])
        }.sortedBy { it.name.lowercase() }
        draft.copy(
            loading = result.second == null && result.third == null,
            error = draft.error ?: result.third ?: sync.error,
            fresh = sync.fresh && sync.complete,
            today = result.first, lastSynced = sync.lastSyncedAt,
            stats = stats, points = points, selectedIndex = selected, selectedDate = points[selected].date,
            periodAmount = points.sumOf { it.amount }, periodReceipts = points.sumOf { it.receipts },
            segments = segments, collectorActivity = activity,
            recentLimit = settings.general.recentPaymentsLimit, dueLimit = settings.general.dueClientsLimit,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), DashboardUiState())

    fun onEvent(event: DashboardEvent) {
        when (event) {
            is DashboardEvent.Range -> if (event.days in listOf(7, 14, 30)) local.update { it.copy(days = event.days) }
            is DashboardEvent.SelectDate -> local.update { it.copy(selectedDate = event.date) }
            DashboardEvent.Refresh -> if (!local.value.refreshing) viewModelScope.launch {
                local.update { it.copy(refreshing = true, error = null) }
                retry.update { it + 1 }
                try { refreshWorkspace() }
                catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException) throw error
                    local.update { it.copy(error = error.message ?: "Refresh failed. Cached information is still available.") }
                } finally { local.update { it.copy(refreshing = false) } }
            }
        }
    }
}
