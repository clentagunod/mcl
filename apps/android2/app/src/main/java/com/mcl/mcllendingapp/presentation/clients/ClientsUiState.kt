package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.domain.model.*

data class ClientsUiState(val query: ListQuery = ListQuery(), val records: Page<Client> = Page(),
    val selected: Set<String> = emptySet(), val loading: Boolean = true, val canWrite: Boolean = false,
    val isAdmin: Boolean = false, val busy: Boolean = false, val confirmTrash: Boolean = false,
    val error: String? = null, val notice: String? = null)
