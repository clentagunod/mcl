package com.mcl.mcllendingapp.presentation.consolidation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.auth.RefreshUseCase
import com.mcl.mcllendingapp.domain.usecase.clients.ObserveClientUseCase
import com.mcl.mcllendingapp.domain.usecase.consolidation.ObserveCollectionDaysUseCase
import com.mcl.mcllendingapp.domain.usecase.consolidation.ObserveConsolidationUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Presents filtered loan consolidation totals and bounded current-cycle collection-day history. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ConsolidationViewModel @Inject constructor(
    observeConsolidation: ObserveConsolidationUseCase,
    observeClient: ObserveClientUseCase,
    observeDays: ObserveCollectionDaysUseCase,
    private val refreshWorkspace: RefreshUseCase,
) : ViewModel() {
    private val local = MutableStateFlow(ConsolidationUiState())
    private val query = MutableStateFlow(ListQuery())
    private val retry = MutableStateFlow(0)
    private val source = combine(query, retry) { request, _ -> request }.flatMapLatest { request ->
        observeConsolidation(request)
            .map<Page<ConsolidationRow>, Pair<Page<ConsolidationRow>?, String?>> { it to null }
            .onStart { emit(null to null) }
            .catch { emit(null to (it.message ?: "The collection ledger could not load.")) }
    }
    private val detail = combine(local.map { it.selectedId }.distinctUntilChanged(), retry) { id, _ -> id }.flatMapLatest { id ->
        if (id == null) flowOf(LedgerDetailUiState())
        else combine(observeClient(id), observeDays(id, 0, 58)) { client, preview ->
            if (client == null) LedgerDetailUiState(error = "This client is unavailable.")
            else {
                val byDay = preview.items.associateBy { it.day }
                LedgerDetailUiState(
                    client = client, totalPayment = client.totalPaid, principal = client.principal,
                    balance = client.principal - client.totalPaid, totalPayingDays = preview.total,
                    matrix = (1..58).map { day ->
                        val receipt = byDay[day]
                        LedgerDayItem(day, receipt?.date, receipt?.amount, receipt?.receipts ?: 0, day == client.loanTermDays, day > client.loanTermDays)
                    },
                )
            }
        }.onStart { emit(LedgerDetailUiState(loading = true)) }.catch { emit(LedgerDetailUiState(error = it.message ?: "The client ledger could not load.")) }
    }
    private val history = combine(local.map { it.selectedId to it.historyPage }.distinctUntilChanged(), retry) { selection, _ -> selection }.flatMapLatest { (id, page) ->
        if (id == null) flowOf(Page<CollectionDay>() to null as String?)
        else observeDays(id, page, 25)
            .map<Page<CollectionDay>, Pair<Page<CollectionDay>?, String?>> { it to null }
            .onStart { emit(null to null) }
            .catch { emit(null to (it.message ?: "Payment history could not load.")) }
    }

    val uiState: StateFlow<ConsolidationUiState> = combine(local, source, detail, history) { draft, result, detail, history ->
        val page = result.first ?: Page(emptyList(), 0, query.value.page, query.value.pageSize, false)
        val totalPayment = page.totals["totalPayment"] ?: 0.0
        val principal = page.totals["principal"] ?: 0.0
        val percent = if (principal > 0.0) totalPayment / principal * 100 else 0.0
        draft.copy(
            loading = result.first == null && result.second == null,
            error = draft.error ?: result.second,
            search = query.value.search, term = query.value.status, sort = query.value.sort,
            page = page, totalPayment = totalPayment, totalPrincipal = principal,
            totalBalance = page.totals["balance"] ?: 0.0, collectedPercent = percent,
            progress = (percent / 100).toFloat().coerceIn(0f, 1f),
            detail = detail.copy(history = history.first ?: Page(), historyItems = history.first?.items.orEmpty().map { day -> LedgerDayItem(day.day, day.date, day.amount, day.receipts, day.day == detail.client?.loanTermDays, day.day > (detail.client?.loanTermDays ?: 58)) }, historyLoading = history.first == null && history.second == null, historyError = history.second),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), ConsolidationUiState())

    fun onEvent(event: ConsolidationEvent) {
        when (event) {
            is ConsolidationEvent.Search -> query.update { it.copy(search = event.value, page = 0) }
            is ConsolidationEvent.Term -> query.update { it.copy(status = event.value, page = 0) }
            is ConsolidationEvent.Sort -> query.update { it.copy(sort = event.value, page = 0) }
            is ConsolidationEvent.PageSize -> query.update { it.copy(pageSize = event.value, page = 0) }
            ConsolidationEvent.NextPage -> if (uiState.value.page.hasMore) query.update { it.copy(page = uiState.value.page.page + 1) }
            ConsolidationEvent.PreviousPage -> query.update { it.copy(page = (uiState.value.page.page - 1).coerceAtLeast(0)) }
            is ConsolidationEvent.OpenLedger -> local.update { it.copy(selectedId = event.clientId, ledgerTab = "matrix", historyPage = 0) }
            is ConsolidationEvent.LedgerTab -> if (event.value in listOf("client", "matrix", "history", "totals")) local.update { it.copy(ledgerTab = event.value) }
            is ConsolidationEvent.InspectDay -> local.update { it.copy(ledgerTab = "history", historyPage = ((event.day - 1) / 25).coerceAtLeast(0)) }
            ConsolidationEvent.NextHistoryPage -> if (uiState.value.detail.history.hasMore) local.update { it.copy(historyPage = uiState.value.detail.history.page + 1) }
            ConsolidationEvent.PreviousHistoryPage -> local.update { it.copy(historyPage = (uiState.value.detail.history.page - 1).coerceAtLeast(0)) }
            ConsolidationEvent.CloseLedger -> local.update { it.copy(selectedId = null, historyPage = 0) }
            ConsolidationEvent.Refresh -> if (!local.value.refreshing) viewModelScope.launch {
                local.update { it.copy(refreshing = true, error = null) }
                retry.update { it + 1 }
                try { refreshWorkspace() }
                catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException) throw error
                    local.update { it.copy(error = error.message ?: "Refresh failed. Cached ledger information remains available.") }
                } finally { local.update { it.copy(refreshing = false) } }
            }
        }
    }
}
