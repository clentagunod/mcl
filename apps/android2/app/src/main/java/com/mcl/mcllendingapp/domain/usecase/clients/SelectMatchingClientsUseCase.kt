package com.mcl.mcllendingapp.domain.usecase.clients

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Select Matching Clients through the authorized repository. */
class SelectMatchingClientsUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(query: ListQuery) = repository.matchingIds("clients", query)
}
