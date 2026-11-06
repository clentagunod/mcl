package com.mcl.mcllendingapp.presentation.consolidation

sealed interface ConsolidationEvent {
    data class Search(val value: String) : ConsolidationEvent
    data class Term(val value: String) : ConsolidationEvent
    data class Sort(val value: String) : ConsolidationEvent
    data class PageSize(val value: Int) : ConsolidationEvent
    data object NextPage : ConsolidationEvent
    data object PreviousPage : ConsolidationEvent
    data class OpenLedger(val clientId: String) : ConsolidationEvent
    data class LedgerTab(val value: String) : ConsolidationEvent
    data class InspectDay(val day: Int) : ConsolidationEvent
    data object NextHistoryPage : ConsolidationEvent
    data object PreviousHistoryPage : ConsolidationEvent
    data object CloseLedger : ConsolidationEvent
    data object Refresh : ConsolidationEvent
}
