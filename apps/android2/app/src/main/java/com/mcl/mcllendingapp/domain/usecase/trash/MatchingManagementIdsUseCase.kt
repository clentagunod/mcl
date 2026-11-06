package com.mcl.mcllendingapp.domain.usecase.trash

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Matching Management Ids through the authorized workspace repository. */
class MatchingManagementIdsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(kind: String, query: ListQuery): List<String> = repository.matchingIds(kind, query)
}
