package com.mcl.mcllendingapp.presentation.trash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.settings.ObserveSettingsUseCase
import com.mcl.mcllendingapp.domain.usecase.trash.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Manages paged Trash, cross-page selection and explicit restore or permanent-delete confirmation. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class TrashViewModel @Inject constructor(
    observeTrash: ObserveTrashUseCase,
    observeSettings: ObserveSettingsUseCase,
    private val matchingIds: MatchingManagementIdsUseCase,
    private val restore: RestoreTrashedClientsUseCase,
    private val purge: PurgeTrashedClientsUseCase,
) : ViewModel() {
    private val local = MutableStateFlow(TrashUiState())
    private val query = MutableStateFlow(ListQuery(pageSize = 25, sort = "deleted_desc"))
    private val refresh = MutableStateFlow(0)
    private val feed = combine(query, refresh) { value, _ -> value }.flatMapLatest { request ->
        observeTrash(request)
            .map<Page<TrashedClient>, Pair<Page<TrashedClient>?, String?>> { it to null }
            .onStart { emit(null to null) }
            .catch { emit(null to (it.message ?: "Trash could not load.")) }
    }
    private val settings = observeSettings().map { it.trash.autoDeleteDays as Int? }.onStart { emit(null) }.catch { emit(null) }
    val uiState: StateFlow<TrashUiState> = combine(local, query, feed, settings) { draft, request, result, retention ->
        draft.copy(
            loading = result.first == null && result.second == null,
            page = result.first ?: Page(emptyList(), 0, request.page, request.pageSize, false),
            error = draft.error ?: result.second,
            search = request.search, filter = request.status, retentionDays = retention,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), TrashUiState())

    fun onEvent(event: TrashEvent) {
        when (event) {
            is TrashEvent.Search -> changeQuery { copy(search = event.value, page = 0) }
            is TrashEvent.Filter -> changeQuery { copy(status = event.value, page = 0) }
            is TrashEvent.Toggle -> {
                val row = uiState.value.page.items.find { it.id == event.id } ?: return
                local.update {
                    if (event.id in it.selected) it.copy(selected = it.selected - event.id, selectedPurging = it.selectedPurging - event.id)
                    else it.copy(selected = it.selected + event.id, selectedPurging = if (row.status == "purging") it.selectedPurging + event.id else it.selectedPurging)
                }
            }
            TrashEvent.SelectPage -> {
                val rows = uiState.value.page.items
                val ids = rows.map { it.id }.toSet()
                local.update {
                    if (it.selected.containsAll(ids)) it.copy(selected = it.selected - ids, selectedPurging = it.selectedPurging - ids)
                    else it.copy(selected = it.selected + ids, selectedPurging = it.selectedPurging + rows.filter { row -> row.status == "purging" }.map { row -> row.id })
                }
            }
            TrashEvent.SelectAll -> selectAll()
            TrashEvent.ClearSelection -> local.update { it.copy(selected = emptySet(), selectedPurging = emptySet()) }
            is TrashEvent.Confirm -> {
                if (event.operation == "restore" && event.ids.any { it in local.value.selectedPurging }) local.update { it.copy(error = "Restoration is unavailable after permanent deletion has started.") }
                else local.update { it.copy(pendingIds = event.ids, operation = event.operation, error = null) }
            }
            TrashEvent.Execute -> execute()
            TrashEvent.Dismiss -> if (!local.value.busy) local.update { it.copy(pendingIds = emptyList(), operation = null, error = null) }
            TrashEvent.NextPage -> if (uiState.value.page.hasMore) query.update { it.copy(page = uiState.value.page.page + 1) }
            TrashEvent.PreviousPage -> query.update { it.copy(page = (uiState.value.page.page - 1).coerceAtLeast(0)) }
            TrashEvent.Retry -> { local.update { it.copy(error = null) }; refresh.update { it + 1 } }
        }
    }

    private fun changeQuery(change: ListQuery.() -> ListQuery) {
        query.update(change)
        local.update { it.copy(selected = emptySet(), selectedPurging = emptySet(), error = null) }
    }

    private fun selectAll() {
        if (local.value.busy) return
        viewModelScope.launch {
            local.update { it.copy(busy = true, error = null) }
            try {
                val request = query.value
                val ids = matchingIds("trash", request).toSet()
                val purging = if (request.status == "trashed") emptySet() else matchingIds("trash", request.copy(status = "purging")).toSet()
                local.update { it.copy(busy = false, selected = ids, selectedPurging = purging.intersect(ids)) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                local.update { it.copy(busy = false, error = error.message ?: "Selection could not load.") }
            }
        }
    }

    private fun execute() {
        val state = uiState.value
        if (state.busy || state.pendingIds.isEmpty()) return
        if (!state.page.fresh) { local.update { it.copy(error = "Connect to the internet and wait for server confirmation before managing Trash.") }; return }
        val operation = state.operation ?: return
        viewModelScope.launch {
            local.update { it.copy(busy = true, error = null, message = null) }
            try {
                when (operation) {
                    "restore" -> restore(state.pendingIds)
                    "purge" -> purge(state.pendingIds)
                    else -> error("Choose a Trash action.")
                }
                local.update { it.copy(busy = false, pendingIds = emptyList(), operation = null, selected = emptySet(), selectedPurging = emptySet(), message = if (operation == "restore") "Clients restored with their original records." else "Selected clients and their financial history were permanently deleted.") }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                local.update { it.copy(busy = false, error = error.message ?: "The Trash action failed. You can retry to finish it.") }
            }
        }
    }
}
