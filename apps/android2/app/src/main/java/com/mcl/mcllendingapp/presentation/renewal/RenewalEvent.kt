package com.mcl.mcllendingapp.presentation.renewal
sealed interface RenewalEvent {
    data class Field(val key:String,val value:String):RenewalEvent
    data class Term(val value:Int):RenewalEvent
    data class Reviewed(val value:Boolean):RenewalEvent
    data class Notes(val value:String):RenewalEvent
    data object SuggestDaily:RenewalEvent
    data object Refresh:RenewalEvent
    data object Grant:RenewalEvent
}
