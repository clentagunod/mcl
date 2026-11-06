package com.mcl.mcllendingapp.domain.usecase.trash

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Observe Trash through the authorized workspace repository. */
class ObserveTrashUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(query: ListQuery): Flow<Page<TrashedClient>> = repository.observeTrash(query)
}
