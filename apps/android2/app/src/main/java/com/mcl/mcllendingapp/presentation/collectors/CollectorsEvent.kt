package com.mcl.mcllendingapp.presentation.collectors

import com.mcl.mcllendingapp.domain.model.UserAccount

sealed interface CollectorsEvent {
    data class Search(val value: String) : CollectorsEvent
    data class FilterRole(val value: String) : CollectorsEvent
    data class FilterStatus(val value: String) : CollectorsEvent
    data class Sort(val value: String) : CollectorsEvent
    data class PageSize(val value: Int) : CollectorsEvent
    data object NextPage : CollectorsEvent
    data object PreviousPage : CollectorsEvent
    data object Retry : CollectorsEvent
    data class Add(val role: String) : CollectorsEvent
    data class Edit(val account: UserAccount) : CollectorsEvent
    data class Draft(val value: AccountDraft) : CollectorsEvent
    data object Save : CollectorsEvent
    data class Confirm(val account: UserAccount, val operation: String) : CollectorsEvent
    data object Execute : CollectorsEvent
    data object Dismiss : CollectorsEvent
}
