package com.mcl.mcllendingapp.domain.usecase.auth

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Session through the authorized repository. */
class ObserveSessionUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke() = repository.session
}
