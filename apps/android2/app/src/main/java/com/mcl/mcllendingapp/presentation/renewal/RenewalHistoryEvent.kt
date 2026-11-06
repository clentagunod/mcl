package com.mcl.mcllendingapp.presentation.renewal
sealed interface RenewalHistoryEvent {
    data class Page(val value:Int):RenewalHistoryEvent
    data object Refresh:RenewalHistoryEvent
}
