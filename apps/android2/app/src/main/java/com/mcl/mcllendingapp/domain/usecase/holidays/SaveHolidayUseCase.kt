package com.mcl.mcllendingapp.domain.usecase.holidays

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Save Holiday through the authorized workspace repository. */
class SaveHolidayUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(holiday: Holiday) = repository.saveHoliday(holiday)
}
