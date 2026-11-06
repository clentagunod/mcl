package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.*
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.domain.usecase.clients.ObserveClientUseCase
import com.mcl.mcllendingapp.domain.usecase.trash.TrashClientsUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Maintains a client's complete detail and safe recycle action. */
@HiltViewModel
class ClientDetailViewModel @Inject constructor(saved:SavedStateHandle,observe:ObserveClientUseCase,
    sync:ObserveSyncUseCase,session:ObserveSessionUseCase,private val refresh:RefreshUseCase,
    private val trash:TrashClientsUseCase):ViewModel() {
    private val id=saved.get<String>("clientId").orEmpty()
    private val mutable=MutableStateFlow(ClientDetailUiState())
    val uiState = visibleState(mutable) {
        launch { observe(id).catch{e->mutable.update{it.copy(loading=false,error=e.message)}}.collect { client->mutable.update{it.copy(client=client,loading=false)} } }
        launch { combine(sync(),session()){a,b->a to b}.collect{(a,b)->mutable.update{it.copy(canWrite=a.canWrite,isAdmin=b.isAdmin,error=a.error)} } }
    }
    fun onEvent(event:ClientDetailEvent) {
        when(event) {
            ClientDetailEvent.AskTrash->mutable.update{it.copy(confirmTrash=true)}
            ClientDetailEvent.CancelTrash->mutable.update{it.copy(confirmTrash=false)}
            else->viewModelScope.launch {
                mutable.update{it.copy(busy=true,error=null)}
                runCatching {
                    if(event==ClientDetailEvent.ConfirmTrash) { trash(listOf(id));mutable.update{it.copy(recycled=true,confirmTrash=false)} }
                    else refresh()
                }.onFailure{e->mutable.update{it.copy(error=e.message)}}
                mutable.update{it.copy(busy=false)}
            }
        }
    }
}
