package com.mcl.mcllendingapp.presentation.trash

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.model.TrashedClient

@Immutable
data class TrashUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val search: String = "",
    val filter: String = "all",
    val page: Page<TrashedClient> = Page(emptyList(), 0, 0, 25),
    val selected: Set<String> = emptySet(),
    val selectedPurging: Set<String> = emptySet(),
    val pendingIds: List<String> = emptyList(),
    val operation: String? = null,
    val retentionDays: Int? = null,
)
