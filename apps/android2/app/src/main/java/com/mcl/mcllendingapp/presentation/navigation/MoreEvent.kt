package com.mcl.mcllendingapp.presentation.navigation
sealed interface MoreEvent {
    data class Theme(val value:String):MoreEvent
    data object SignOut:MoreEvent
}
