package com.mcl.mcllendingapp.domain.usecase.holidays

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Delete Holiday through the authorized workspace repository. */
class DeleteHolidayUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(date: String) = repository.deleteHoliday(date)
}
