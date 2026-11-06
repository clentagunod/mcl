package com.mcl.mcllendingapp.presentation.settings

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.AppSettings

@Immutable
data class SettingsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val unavailable: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val section: String = "general",
    val saved: AppSettings = AppSettings(),
    val values: Map<String, String> = emptyMap(),
    val draft: Map<String, String>? = null,
    val baselineRevision: String? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val incompleteClientCount: Int? = null,
    val dirty: Boolean = false,
    val conflict: Boolean = false,
)
