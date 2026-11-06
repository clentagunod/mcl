package com.mcl.mcllendingapp.domain.usecase.trash

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Purge Trashed Clients through the authorized workspace repository. */
class PurgeTrashedClientsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(ids: List<String>) = repository.purgeClients(ids)
}
