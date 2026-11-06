package com.mcl.mcllendingapp.domain.usecase.consolidation

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Consolidation through the authorized repository. */
class ObserveConsolidationUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(query: ListQuery) = repository.observeConsolidation(query)
}
