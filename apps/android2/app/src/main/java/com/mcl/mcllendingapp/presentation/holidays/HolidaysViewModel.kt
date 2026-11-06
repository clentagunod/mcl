package com.mcl.mcllendingapp.presentation.holidays

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.holidays.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

/** Maintains the collection calendar, bounded holiday lists and validated changes. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HolidaysViewModel @Inject constructor(
    observeHolidays: ObserveHolidaysUseCase,
    private val saveHoliday: SaveHolidayUseCase,
    private val deleteHoliday: DeleteHolidayUseCase,
) : ViewModel() {
    private val today = LocalDate.now(ZoneId.of("Asia/Manila")).toString()
    private val local = MutableStateFlow(HolidaysUiState(today = today, month = today.take(7)))
    private val query = MutableStateFlow(ListQuery(sort = "date_desc"))
    private val refresh = MutableStateFlow(0)
    private val feed = combine(query, refresh) { value, _ -> value }.flatMapLatest { request ->
        observeHolidays(request)
            .map<Page<Holiday>, Pair<Page<Holiday>?, String?>> { it to null }
            .onStart { emit(null to null) }
            .catch { emit(null to (it.message ?: "Holidays could not load.")) }
    }
    private val monthFeed = local.map { it.month }.distinctUntilChanged().flatMapLatest { month ->
        observeHolidays(ListQuery(search = month, pageSize = 35, sort = "date"))
            .map { it.items }.onStart { emit(emptyList()) }.catch { emit(emptyList()) }
    }
    private val nextFeed = observeHolidays(ListQuery(status = "upcoming", pageSize = 1, sort = "date"))
        .map { it.items.firstOrNull() }.onStart { emit(null) }.catch { emit(null) }

    val uiState: StateFlow<HolidaysUiState> = combine(local, feed, monthFeed, nextFeed) { draft, result, monthDates, upcoming ->
        val month = YearMonth.parse(draft.month)
        val cells = List(month.atDay(1).dayOfWeek.value % 7) { "" } + (1..month.lengthOfMonth()).map { month.atDay(it).toString() }
        draft.copy(
            loading = result.first == null && result.second == null,
            page = result.first ?: Page(emptyList(), 0, query.value.page, query.value.pageSize, false),
            error = draft.error ?: result.second,
            search = query.value.search, filter = query.value.status,
            monthTitle = month.format(DateTimeFormatter.ofPattern("MMMM yyyy")),
            calendarCells = cells,
            calendarHolidays = monthDates.associate { it.date to it.name },
            nextHoliday = upcoming,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), local.value)

    fun onEvent(event: HolidaysEvent) {
        when (event) {
            is HolidaysEvent.Search -> query.update { it.copy(search = event.value, page = 0) }
            is HolidaysEvent.Filter -> query.update { it.copy(status = event.value, page = 0) }
            is HolidaysEvent.Month -> local.update { it.copy(month = YearMonth.parse(it.month).plusMonths(event.offset).toString()) }
            HolidaysEvent.Today -> chooseDate(today)
            is HolidaysEvent.Date -> chooseDate(event.value)
            is HolidaysEvent.Name -> local.update { it.copy(name = event.value, fieldErrors = it.fieldErrors - "name", message = null) }
            HolidaysEvent.Save -> save()
            is HolidaysEvent.Delete -> local.update { it.copy(deleting = event.holiday, error = null) }
            HolidaysEvent.ConfirmDelete -> local.value.deleting?.let { holiday -> runAction("Holiday deleted. Due dates now use the updated calendar.") { deleteHoliday(holiday.date) } }
            HolidaysEvent.Dismiss -> if (!local.value.busy) local.update { it.copy(deleting = null, error = null) }
            HolidaysEvent.NextPage -> if (uiState.value.page.hasMore) query.update { it.copy(page = uiState.value.page.page + 1) }
            HolidaysEvent.PreviousPage -> query.update { it.copy(page = (uiState.value.page.page - 1).coerceAtLeast(0)) }
            HolidaysEvent.Retry -> { local.update { it.copy(error = null) }; refresh.update { it + 1 } }
        }
    }

    private fun chooseDate(date: String) {
        val savedName = uiState.value.calendarHolidays[date] ?: uiState.value.page.items.find { it.date == date }?.name
        val month = runCatching { YearMonth.from(LocalDate.parse(date)).toString() }.getOrNull()
        local.update { it.copy(date = date, month = month ?: it.month, name = savedName ?: it.name, fieldErrors = it.fieldErrors - "date", message = null) }
    }

    private fun save() {
        val draft = local.value
        val errors = buildMap {
            if (runCatching { LocalDate.parse(draft.date) }.isFailure) put("date", "Choose a valid date.")
            if (draft.name.isBlank()) put("name", "Enter the holiday name.")
            else if (draft.name.length > 80) put("name", "Use at most 80 characters.")
        }
        if (errors.isNotEmpty()) { local.update { it.copy(fieldErrors = errors) }; return }
        val holiday = Holiday(draft.date, draft.name.trim().replace(Regex("\\s+"), " "))
        val verb = if (uiState.value.calendarHolidays.containsKey(draft.date)) "updated" else "added"
        runAction(holiday.name + " " + verb + " for " + holiday.date + ".") {
            saveHoliday(holiday)
            local.update { it.copy(date = "", name = "", fieldErrors = emptyMap()) }
        }
    }

    private fun runAction(message: String, action: suspend () -> Unit) {
        if (local.value.busy) return
        if (!uiState.value.page.fresh) { local.update { it.copy(error = "Wait for server confirmation before changing holidays.") }; return }
        viewModelScope.launch {
            local.update { it.copy(busy = true, error = null, message = null) }
            try {
                action()
                local.update { it.copy(busy = false, deleting = null, message = message) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                local.update { it.copy(busy = false, error = error.message ?: "The calendar change failed. Try again.") }
            }
        }
    }
}
