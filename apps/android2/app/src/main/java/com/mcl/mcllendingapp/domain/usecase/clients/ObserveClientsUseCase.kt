package com.mcl.mcllendingapp.domain.usecase.clients

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Clients through the authorized repository. */
class ObserveClientsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(query: ListQuery) = repository.observeClients(query)
}
