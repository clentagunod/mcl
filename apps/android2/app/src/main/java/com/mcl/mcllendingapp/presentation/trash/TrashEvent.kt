package com.mcl.mcllendingapp.presentation.trash

sealed interface TrashEvent {
    data class Search(val value: String) : TrashEvent
    data class Filter(val value: String) : TrashEvent
    data class Toggle(val id: String) : TrashEvent
    data object SelectPage : TrashEvent
    data object SelectAll : TrashEvent
    data object ClearSelection : TrashEvent
    data class Confirm(val operation: String, val ids: List<String>) : TrashEvent
    data object Execute : TrashEvent
    data object Dismiss : TrashEvent
    data object NextPage : TrashEvent
    data object PreviousPage : TrashEvent
    data object Retry : TrashEvent
}
