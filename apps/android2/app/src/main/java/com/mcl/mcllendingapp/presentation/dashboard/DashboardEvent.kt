package com.mcl.mcllendingapp.presentation.dashboard

sealed interface DashboardEvent {
    data class Range(val days: Int) : DashboardEvent
    data class SelectDate(val date: String) : DashboardEvent
    data object Refresh : DashboardEvent
}
