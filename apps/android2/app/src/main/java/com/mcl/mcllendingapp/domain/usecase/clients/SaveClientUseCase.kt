package com.mcl.mcllendingapp.domain.usecase.clients

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Save Client through the authorized repository. */
class SaveClientUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(client: Client, expected: Client? = null) = repository.saveClient(client, expected)
}
