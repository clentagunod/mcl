package com.mcl.mcllendingapp.presentation.collectors

import androidx.compose.runtime.Immutable
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.model.UserAccount

@Immutable
data class CollectorsUiState(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val search: String = "",
    val role: String = "all",
    val status: String = "all",
    val sort: String = "default",
    val page: Page<UserAccount> = Page(emptyList(), 0, 0, 10),
    val currentUserId: String = "",
    val draft: AccountDraft? = null,
    val fieldErrors: Map<String, String> = emptyMap(),
    val pendingAccount: UserAccount? = null,
    val pendingOperation: String? = null,
)
