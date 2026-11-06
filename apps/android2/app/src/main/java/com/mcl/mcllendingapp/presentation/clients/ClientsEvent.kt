package com.mcl.mcllendingapp.presentation.clients

sealed interface ClientsEvent {
    data class Search(val value:String): ClientsEvent
    data class Status(val value:String): ClientsEvent
    data class Sort(val value:String): ClientsEvent
    data class Page(val value:Int): ClientsEvent
    data class PageSize(val value:Int): ClientsEvent
    data class Toggle(val id:String): ClientsEvent
    data object SelectPage: ClientsEvent
    data object SelectAll: ClientsEvent
    data object Clear: ClientsEvent
    data object Refresh: ClientsEvent
    data object AskTrash: ClientsEvent
    data object CancelTrash: ClientsEvent
    data object ConfirmTrash: ClientsEvent
}
