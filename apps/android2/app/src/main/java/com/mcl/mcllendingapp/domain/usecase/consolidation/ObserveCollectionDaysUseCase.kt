package com.mcl.mcllendingapp.domain.usecase.consolidation

import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observes one bounded page of current-loan paying dates, including dates after day 58. */
class ObserveCollectionDaysUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(clientId: String, page: Int = 0, pageSize: Int = 25) = repository.observeCollectionDays(clientId, page, pageSize)
}
