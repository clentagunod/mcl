package com.mcl.mcllendingapp.presentation.renewal

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.*
import com.mcl.mcllendingapp.domain.usecase.auth.RefreshUseCase
import com.mcl.mcllendingapp.domain.usecase.renewal.ObserveRenewalsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Pages immutable renewal snapshots without mixing past and current receipts. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class RenewalHistoryViewModel @Inject constructor(saved:SavedStateHandle,observe:ObserveRenewalsUseCase,
    private val refresh:RefreshUseCase):ViewModel(){
    private val id=saved.get<String>("clientId").orEmpty()
    private val page=MutableStateFlow(0)
    private val mutable=MutableStateFlow(RenewalHistoryUiState())
    val uiState = visibleState(mutable) {launch{page.flatMapLatest{observe(id,it)}.catch{e->mutable.update{it.copy(loading=false,error=e.message)}}
        .collect{r->mutable.update{it.copy(records=r,loading=false)}}}}
    fun onEvent(event:RenewalHistoryEvent){
        when(event){is RenewalHistoryEvent.Page->page.value=event.value.coerceAtLeast(0)
            RenewalHistoryEvent.Refresh->viewModelScope.launch{runCatching{refresh()}.onFailure{e->mutable.update{it.copy(error=e.message)}}}}
    }
}
