package com.mcl.mcllendingapp.presentation.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.AppSettings
import com.mcl.mcllendingapp.domain.usecase.settings.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Stages shared settings, validates all sections and rejects stale baseline saves. */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
@HiltViewModel
class SettingsViewModel @Inject constructor(
    observeSettings: ObserveSettingsUseCase,
    observeIncompleteClients: ObserveIncompleteClientCountUseCase,
    private val saveSettings: SaveSettingsUseCase,
    private val completeRecords: CompleteClientRecordsUseCase,
    private val initializeSettings: InitializeSettingsUseCase,
) : ViewModel() {
    private val local = MutableStateFlow(SettingsUiState())
    private val refresh = MutableStateFlow(0)
    private val source = refresh.flatMapLatest {
        observeSettings().map<AppSettings, Pair<AppSettings?, String?>> { it to null }.onStart { emit(null to null) }.catch { emit(null to (it.message ?: "Settings are unavailable.")) }
    }
    private val incompleteClients = observeIncompleteClients().map { it as Int? }.onStart { emit(null) }.catch { emit(null) }
    val uiState: StateFlow<SettingsUiState> = combine(local, source, incompleteClients) { draft, source, incomplete ->
        val saved = source.first ?: draft.saved
        val values = draft.draft ?: settingsValues(saved)
        draft.copy(
            loading = source.first == null && source.second == null,
            saved = saved, values = values, incompleteClientCount = incomplete,
            unavailable = source.second != null,
            error = draft.error ?: source.second,
            dirty = values != settingsValues(saved),
            conflict = draft.baselineRevision != null && draft.baselineRevision != saved.revision,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), SettingsUiState())

    fun onEvent(event: SettingsEvent) {
        when (event) {
            is SettingsEvent.Section -> if (settingsSections.any { it.first == event.value }) local.update { it.copy(section = event.value) }
            is SettingsEvent.Field -> local.update { it.copy(draft = uiState.value.values + (event.key to event.value), baselineRevision = it.baselineRevision ?: uiState.value.saved.revision, fieldErrors = it.fieldErrors - event.key, message = null, error = null) }
            SettingsEvent.Discard -> local.update { it.copy(draft = null, baselineRevision = null, fieldErrors = emptyMap(), error = null, message = null) }
            SettingsEvent.RestoreDefaults -> local.update { it.copy(draft = settingsValues(AppSettings()), baselineRevision = uiState.value.saved.revision, fieldErrors = emptyMap(), error = null, message = "Default values loaded. Save to apply them.") }
            SettingsEvent.Save -> save()
            SettingsEvent.InitializeDefaults -> runAction("Missing workspace settings created.") { initializeSettings() }
            SettingsEvent.CompleteRecords -> runAction("Missing client identifiers, transaction numbers and daily amounts have been completed.") { completeRecords() }
            SettingsEvent.Retry -> { local.update { it.copy(error = null) }; refresh.update { it + 1 } }
        }
    }

    private fun save() {
        if (uiState.value.conflict) {
            local.update { it.copy(error = "Settings changed in another session. Reload saved settings before saving.") }
            return
        }
        val validation = validateSettingsValues(uiState.value.values, uiState.value.saved)
        if (validation.value == null) {
            local.update { it.copy(fieldErrors = validation.errors, section = validation.errors.keys.first().substringBefore('.'), error = "Correct the highlighted fields before saving.") }
            return
        }
        val expected = local.value.baselineRevision ?: uiState.value.saved.revision
        runAction("Settings saved. Connected sessions update automatically.") {
            saveSettings(validation.value, expected)
            local.update { it.copy(draft = null, baselineRevision = null, fieldErrors = emptyMap()) }
        }
    }

    private fun runAction(message: String, action: suspend () -> Unit) {
        if (local.value.busy) return
        viewModelScope.launch {
            local.update { it.copy(busy = true, error = null, message = null) }
            try {
                action()
                local.update { it.copy(busy = false, message = message) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                local.update { it.copy(busy = false, error = error.message ?: "Settings could not be saved.") }
            }
        }
    }
}
