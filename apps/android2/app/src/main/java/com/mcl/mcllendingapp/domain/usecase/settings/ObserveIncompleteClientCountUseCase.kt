package com.mcl.mcllendingapp.domain.usecase.settings

import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/** Observes the global count of incomplete client records using a bounded page. */
class ObserveIncompleteClientCountUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke() = repository.observeClients(ListQuery(pageSize = 1)).map { it.counts["incomplete"] ?: 0 }
}
