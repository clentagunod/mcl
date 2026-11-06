package com.mcl.mcllendingapp.presentation.components

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

fun <S> ViewModel.visibleState(state: StateFlow<S>, observe: suspend CoroutineScope.() -> Unit): StateFlow<S> =
    channelFlow {
        val watchers=launch(block=observe)
        val forwarding=launch { state.collect { send(it) } }
        awaitClose { watchers.cancel();forwarding.cancel() }
    }.stateIn(viewModelScope,SharingStarted.WhileSubscribed(stopTimeoutMillis=0),state.value)
