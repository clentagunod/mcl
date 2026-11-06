package com.mcl.mcllendingapp.presentation.holidays

import com.mcl.mcllendingapp.domain.model.Holiday

sealed interface HolidaysEvent {
    data class Search(val value: String) : HolidaysEvent
    data class Filter(val value: String) : HolidaysEvent
    data class Month(val offset: Long) : HolidaysEvent
    data object Today : HolidaysEvent
    data class Date(val value: String) : HolidaysEvent
    data class Name(val value: String) : HolidaysEvent
    data object Save : HolidaysEvent
    data class Delete(val holiday: Holiday) : HolidaysEvent
    data object ConfirmDelete : HolidaysEvent
    data object Dismiss : HolidaysEvent
    data object NextPage : HolidaysEvent
    data object PreviousPage : HolidaysEvent
    data object Retry : HolidaysEvent
}
