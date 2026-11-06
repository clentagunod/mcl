package com.mcl.mcllendingapp.domain.usecase.trash

import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Moves clients to reversible Trash while preserving their financial history. */
class TrashClientsUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(ids: List<String>) = repository.trashClients(ids)
}
