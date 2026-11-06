package com.mcl.mcllendingapp.domain.usecase.accounts

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Reset Account Password through the authorized workspace repository. */
class ResetAccountPasswordUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(email: String) = repository.resetPassword(email)
}
