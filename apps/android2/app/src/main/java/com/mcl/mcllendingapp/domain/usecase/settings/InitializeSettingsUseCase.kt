package com.mcl.mcllendingapp.domain.usecase.settings

import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Creates missing workspace settings without replacing existing values. */
class InitializeSettingsUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke() = repository.initializeSettings()
}
