package com.mcl.mcllendingapp.domain.usecase.accounts

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Set Account Active through the authorized workspace repository. */
class SetAccountActiveUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(id: String, active: Boolean) = repository.setAccountActive(id, active)
}
