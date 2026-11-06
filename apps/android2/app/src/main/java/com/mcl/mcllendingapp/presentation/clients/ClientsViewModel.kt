package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.domain.usecase.clients.*
import com.mcl.mcllendingapp.domain.usecase.trash.TrashClientsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Owns paged client search, selection and reversible recycling. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class ClientsViewModel @Inject constructor(observe: ObserveClientsUseCase,
    sync: ObserveSyncUseCase, session: ObserveSessionUseCase, private val refresh: RefreshUseCase,
    private val matching: SelectMatchingClientsUseCase, private val trash: TrashClientsUseCase): ViewModel() {
    private val query = MutableStateFlow(ListQuery())
    private val mutable = MutableStateFlow(ClientsUiState())
    val uiState = visibleState(mutable) {
        launch { query.flatMapLatest { observe(it) }.catch { e -> mutable.update { it.copy(loading=false,error=e.message) } }
            .collect { page ->
                val available=if(page.fresh&&mutable.value.selected.isNotEmpty())matching(query.value).toSet() else null
                mutable.update { it.copy(records=page,query=query.value,loading=false,
                    selected=available?.let{ids->it.selected.intersect(ids)}?:it.selected) }
            } }
        launch { combine(sync(),session()) { a,b -> a to b }.collect { (a,b) ->
            mutable.update { it.copy(canWrite=a.canWrite,isAdmin=b.isAdmin,error=a.error,loading=a.loading&&it.records.total==0) } } }
    }
    fun onEvent(event: ClientsEvent) {
        when(event) {
            is ClientsEvent.Search -> update(query.value.copy(search=event.value,page=0),true)
            is ClientsEvent.Status -> update(query.value.copy(status=event.value,page=0),true)
            is ClientsEvent.Sort -> update(query.value.copy(sort=event.value,page=0))
            is ClientsEvent.Page -> update(query.value.copy(page=event.value.coerceAtLeast(0)))
            is ClientsEvent.PageSize -> update(query.value.copy(pageSize=event.value,page=0))
            is ClientsEvent.Toggle -> mutable.update { it.copy(selected=if(event.id in it.selected) it.selected-event.id else it.selected+event.id) }
            ClientsEvent.SelectPage -> mutable.update { state ->
                val ids=state.records.items.map { it.id }.toSet()
                state.copy(selected=if(state.selected.containsAll(ids)) state.selected-ids else state.selected+ids) }
            ClientsEvent.SelectAll -> action { mutable.update { it.copy(selected=matching(query.value).toSet()) } }
            ClientsEvent.Clear -> mutable.update { it.copy(selected=emptySet()) }
            ClientsEvent.Refresh -> action { refresh() }
            ClientsEvent.AskTrash -> mutable.update { it.copy(confirmTrash=true) }
            ClientsEvent.CancelTrash -> mutable.update { it.copy(confirmTrash=false) }
            ClientsEvent.ConfirmTrash -> action {
                trash(mutable.value.selected.toList())
                mutable.update { it.copy(selected=emptySet(),confirmTrash=false,notice="Clients moved to Trash.") }
            }
        }
    }
    private fun update(value:ListQuery,clear:Boolean=false) {
        query.value=value
        mutable.update { it.copy(query=value,selected=if(clear) emptySet() else it.selected) }
    }
    private fun action(block:suspend()->Unit) {
        if(mutable.value.busy) return
        viewModelScope.launch {
            mutable.update { it.copy(busy=true,error=null,notice=null) }
            runCatching { block() }.onFailure { e -> mutable.update { it.copy(error=e.message) } }
            mutable.update { it.copy(busy=false) }
        }
    }
}
