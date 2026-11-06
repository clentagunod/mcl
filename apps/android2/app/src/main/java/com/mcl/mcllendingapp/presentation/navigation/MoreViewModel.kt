package com.mcl.mcllendingapp.presentation.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.ui.theme.ThemePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Presents the authenticated account and persisted app appearance choices. */
@HiltViewModel
class MoreViewModel @Inject constructor(session:ObserveSessionUseCase,private val signOut:SignOutUseCase,
    private val themes:ThemePreferences):ViewModel(){
    private val mutable=MutableStateFlow(MoreUiState())
    val uiState=mutable.asStateFlow()
    init{viewModelScope.launch{combine(session(),themes.mode){a,b->a to b}.collect{(a,b)->
        mutable.update{it.copy(name=a.account?.fullName.orEmpty(),email=a.account?.email.orEmpty(),role=a.account?.role.orEmpty(),theme=b)}}}}
    fun onEvent(event:MoreEvent){
        runCatching{when(event){is MoreEvent.Theme->themes.setMode(event.value);MoreEvent.SignOut->signOut()}}
            .onFailure{e->mutable.update{it.copy(error=e.message)}}
    }
}
