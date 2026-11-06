package com.mcl.mcllendingapp.domain.usecase.dashboard

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Dashboard through the authorized repository. */
class ObserveDashboardUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(date: String) = repository.observeDashboard(date)
}
