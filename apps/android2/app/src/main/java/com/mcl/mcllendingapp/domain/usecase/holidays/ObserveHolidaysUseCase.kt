package com.mcl.mcllendingapp.domain.usecase.holidays

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Observe Holidays through the authorized workspace repository. */
class ObserveHolidaysUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(query: ListQuery): Flow<Page<Holiday>> = repository.observeHolidays(query)
}
