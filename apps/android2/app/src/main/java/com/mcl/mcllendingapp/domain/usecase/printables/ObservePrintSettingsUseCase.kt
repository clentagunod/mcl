package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observes shared lender details and document defaults for the active print screen. */
class ObservePrintSettingsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke() = repository.observeSettings()
}
