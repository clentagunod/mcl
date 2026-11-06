package com.mcl.mcllendingapp.presentation.holidays

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.Holiday
import com.mcl.mcllendingapp.domain.model.Page

@Immutable
data class HolidaysUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val search: String = "",
    val filter: String = "all",
    val today: String = "",
    val month: String = "",
    val monthTitle: String = "",
    val calendarCells: List<String> = emptyList(),
    val calendarHolidays: Map<String, String> = emptyMap(),
    val nextHoliday: Holiday? = null,
    val date: String = "",
    val name: String = "",
    val fieldErrors: Map<String, String> = emptyMap(),
    val page: Page<Holiday> = Page(emptyList(), 0, 0, 25),
    val deleting: Holiday? = null,
)
