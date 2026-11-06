package com.mcl.mcllendingapp.domain.usecase.clients

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Client through the authorized repository. */
class ObserveClientUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(id: String) = repository.observeClient(id)
}
