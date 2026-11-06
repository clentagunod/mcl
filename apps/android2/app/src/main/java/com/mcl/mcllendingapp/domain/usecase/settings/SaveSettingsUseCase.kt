package com.mcl.mcllendingapp.domain.usecase.settings

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Save Settings through the authorized workspace repository. */
class SaveSettingsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(settings: AppSettings, expectedRevision: String) = repository.saveSettings(settings, expectedRevision)
}
