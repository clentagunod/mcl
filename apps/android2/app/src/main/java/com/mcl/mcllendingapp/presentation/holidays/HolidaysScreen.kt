package com.mcl.mcllendingapp.presentation.holidays

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.ui.theme.AppDimensions

@Composable
fun HolidaysScreen(viewModel: HolidaysViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    HolidaysContent(state, viewModel::onEvent)
}

@Composable
fun HolidaysContent(state: HolidaysUiState, onEvent: (HolidaysEvent) -> Unit) {
    LazyColumn(Modifier.widthIn(max = AppDimensions.fieldMaxWidth).fillMaxSize().imePadding(), contentPadding = PaddingValues(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.medium)) {
        item {
            Text("Holidays", style = MaterialTheme.typography.headlineMedium)
            Text("Plan non-collection days. Sundays are already excluded, and due dates adjust with your calendar.")
            Text("Saved " + (state.page.counts["total"] ?: state.page.total) + " · Upcoming " + (state.page.counts["upcoming"] ?: 0), style = MaterialTheme.typography.labelLarge)
            Text(state.nextHoliday?.let { "Next: " + it.name + " · " + it.date } ?: "No upcoming holiday")
        }
        if (state.loading) item { CircularProgressIndicator() }
        state.error?.let { item {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Column(Modifier.padding(AppSpacing.medium)) {
                    Text(it)
                    TextButton(onClick = { onEvent(HolidaysEvent.Retry) }) { Text("Retry") }
                }
            }
        } }
        if (!state.page.fresh && !state.loading) item { Text("Showing cached holidays. Connect before changing the calendar.") }
        state.message?.let { item { Text(it, color = MaterialTheme.colorScheme.primary) } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { onEvent(HolidaysEvent.Month(-1)) }) { Text("Previous") }
                        Text(state.monthTitle, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(AppSpacing.small))
                        TextButton(onClick = { onEvent(HolidaysEvent.Month(1)) }) { Text("Next") }
                    }
                    Row { listOf("Su", "Mo", "Tu", "We", "Th", "Fr", "Sa").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall) } }
                    state.calendarCells.chunked(7).forEach { week ->
                        Row(Modifier.fillMaxWidth()) {
                            (week + List(7 - week.size) { "" }).forEach { date ->
                                if (date.isBlank()) Spacer(Modifier.weight(1f))
                                else TextButton(
                                    onClick = { onEvent(HolidaysEvent.Date(date)) },
                                    modifier = Modifier.weight(1f).semantics { contentDescription = date + (state.calendarHolidays[date]?.let { ", " + it } ?: "") },
                                    enabled = !state.busy,
                                    contentPadding = PaddingValues(AppSpacing.extraSmall),
                                    colors = ButtonDefaults.textButtonColors(
                                        contentColor = if (date == state.date) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                                        containerColor = if (date == state.date) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                                    ),
                                ) {
                                    Column {
                                        Text(date.takeLast(2).toInt().toString(), style = MaterialTheme.typography.labelLarge)
                                        if (state.calendarHolidays.containsKey(date)) Text("•", color = if (date == state.date) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
                                        else if (date == state.today) Text("Today", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }
                    Text("• Saved holiday", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { onEvent(HolidaysEvent.Today) }, enabled = !state.busy) { Text("Today") }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                    Text("Add or update a holiday", style = MaterialTheme.typography.titleLarge)
                    OutlinedTextField(state.date, { onEvent(HolidaysEvent.Date(it)) }, Modifier.fillMaxWidth(), label = { Text("Date · YYYY-MM-DD") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii), singleLine = true, isError = state.fieldErrors.containsKey("date"), supportingText = { Text(state.fieldErrors["date"] ?: "Choose a date on the calendar or type it here.") }, enabled = !state.busy)
                    OutlinedTextField(state.name, { onEvent(HolidaysEvent.Name(it)) }, Modifier.fillMaxWidth(), label = { Text("Holiday name") }, singleLine = true, isError = state.fieldErrors.containsKey("name"), supportingText = { Text(state.fieldErrors["name"] ?: "At most 80 characters.") }, enabled = !state.busy)
                    if (state.calendarHolidays.containsKey(state.date)) Text("This date is already saved. Its name will be updated.")
                    Button(onClick = { onEvent(HolidaysEvent.Save) }, enabled = !state.busy && state.page.fresh) { Text(if (state.busy) "Saving…" else "Save holiday") }
                }
            }
        }
        item {
            Text("Saved holidays", style = MaterialTheme.typography.titleLarge)
            OutlinedTextField(state.search, { onEvent(HolidaysEvent.Search(it)) }, Modifier.fillMaxWidth(), label = { Text("Search name or date") }, singleLine = true)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
                items(listOf("all" to "All dates", "upcoming" to "Upcoming", "past" to "Past")) { (value, label) ->
                    FilterChip(selected = state.filter == value, onClick = { onEvent(HolidaysEvent.Filter(value)) }, label = { Text(label) })
                }
            }
        }
        if (!state.loading && state.page.items.isEmpty()) item { Text(if (state.search.isBlank() && state.filter == "all") "No holidays yet. Only Sundays are skipped." else "No holidays match these filters.") }
        items(state.page.items, key = { it.date }) { holiday ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(AppSpacing.medium), verticalArrangement = Arrangement.spacedBy(AppSpacing.extraSmall)) {
                    Text(holiday.name, style = MaterialTheme.typography.titleMedium)
                    Text(holiday.date)
                    Text(if (holiday.date >= state.today) "Upcoming non-collection day" else "Past non-collection day", style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { onEvent(HolidaysEvent.Date(holiday.date)); onEvent(HolidaysEvent.Name(holiday.name)) }, enabled = !state.busy) { Text("Edit") }
                        TextButton(onClick = { onEvent(HolidaysEvent.Delete(holiday)) }, enabled = !state.busy && state.page.fresh) { Text("Delete", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { onEvent(HolidaysEvent.PreviousPage) }, enabled = state.page.page > 0 && !state.loading) { Text("Previous") }
                Text("Page " + (state.page.page + 1), modifier = Modifier.weight(1f).padding(AppSpacing.small))
                TextButton(onClick = { onEvent(HolidaysEvent.NextPage) }, enabled = state.page.hasMore && !state.loading) { Text("Next") }
            }
        }
    }
    state.deleting?.let { holiday ->
        AlertDialog(onDismissRequest = { onEvent(HolidaysEvent.Dismiss) }, title = { Text("Delete holiday") }, text = { Column { Text("Remove " + holiday.name + " (" + holiday.date + ")? This day will count toward loan terms again, so due dates may move earlier."); state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) } } }, confirmButton = { TextButton(onClick = { onEvent(HolidaysEvent.ConfirmDelete) }, enabled = !state.busy && state.page.fresh) { Text(if (state.busy) "Deleting…" else "Delete") } }, dismissButton = { TextButton(onClick = { onEvent(HolidaysEvent.Dismiss) }, enabled = !state.busy) { Text("Cancel") } })
    }
}
