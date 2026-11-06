package com.mcl.mcllendingapp.presentation.navigation

import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.usecase.settings.ObserveSettingsUseCase
import com.mcl.mcllendingapp.presentation.components.visibleState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.ui.theme.ThemePreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Shares account authorization, synchronization and appearance across the workspace. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class RootViewModel @Inject constructor(session:ObserveSessionUseCase,sync:ObserveSyncUseCase,
    private val signOut:SignOutUseCase,private val refresh:RefreshUseCase,
    private val legacy:ImportLegacyReceiptsUseCase,private val themes:ThemePreferences, observeSettings:ObserveSettingsUseCase):ViewModel(){
    private val mutable=MutableStateFlow(RootUiState())
    val uiState=visibleState(mutable){
        val settingsFlow=session().flatMapLatest{if(it.authorized)observeSettings() else flowOf(AppSettings())}
        combine(session(),sync(),themes.mode,settingsFlow){a,b,c,d->RootUiState(session=a,sync=b,theme=c,businessName=d.general.businessName)}
            .collect{next->mutable.update{previous->next.copy(error=previous.error,
                legacyComplete=if(previous.session.account?.uid==next.session.account?.uid)previous.legacyComplete else false)}}
    }
    fun onEvent(event:RootEvent){
        if(event is RootEvent.Theme){themes.setMode(event.value);return}
        viewModelScope.launch{
            mutable.update{it.copy(error=null)}
            runCatching{
                when(event){RootEvent.SignOut->signOut();RootEvent.Refresh->refresh()
                    is RootEvent.LegacyReceipts->{legacy(event.values);mutable.update{it.copy(legacyComplete=true)}};else->Unit}
            }.onFailure{e->mutable.update{it.copy(error=e.message)}}
        }
    }
}
