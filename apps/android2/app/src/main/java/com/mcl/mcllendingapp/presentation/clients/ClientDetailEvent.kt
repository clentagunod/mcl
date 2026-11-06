package com.mcl.mcllendingapp.presentation.clients
sealed interface ClientDetailEvent {
    data object Refresh:ClientDetailEvent
    data object AskTrash:ClientDetailEvent
    data object CancelTrash:ClientDetailEvent
    data object ConfirmTrash:ClientDetailEvent
}
