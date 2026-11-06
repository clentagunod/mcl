package com.mcl.mcllendingapp.presentation.clients

sealed interface ClientFormEvent {
    data class Field(val key:String,val value:String):ClientFormEvent
    data class Term(val value:Int):ClientFormEvent
    data object SuggestDaily:ClientFormEvent
    data object Save:ClientFormEvent
}
