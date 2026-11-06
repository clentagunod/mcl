package com.mcl.mcllendingapp.domain.usecase.accounts

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Get Management Session through the authorized workspace repository. */
class GetManagementSessionUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(): StateFlow<SessionState> = repository.session
}
