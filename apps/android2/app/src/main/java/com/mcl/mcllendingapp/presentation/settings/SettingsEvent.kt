package com.mcl.mcllendingapp.presentation.settings

sealed interface SettingsEvent {
    data class Section(val value: String) : SettingsEvent
    data class Field(val key: String, val value: String) : SettingsEvent
    data object Save : SettingsEvent
    data object Discard : SettingsEvent
    data object RestoreDefaults : SettingsEvent
    data object InitializeDefaults : SettingsEvent
    data object CompleteRecords : SettingsEvent
    data object Retry : SettingsEvent
}
