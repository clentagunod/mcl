package com.mcl.mcllendingapp.presentation.navigation
sealed interface RootEvent {
    data class Theme(val value:String):RootEvent
    data class LegacyReceipts(val values:Map<String,String>):RootEvent
    data object SignOut:RootEvent
    data object Refresh:RootEvent
}
