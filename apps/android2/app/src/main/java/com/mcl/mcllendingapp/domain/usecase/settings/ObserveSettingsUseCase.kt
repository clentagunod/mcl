package com.mcl.mcllendingapp.domain.usecase.settings

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Observe Settings through the authorized workspace repository. */
class ObserveSettingsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(): Flow<AppSettings> = repository.observeSettings()
}
