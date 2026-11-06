package com.mcl.mcllendingapp.domain.usecase.accounts

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Delete Account through the authorized workspace repository. */
class DeleteAccountUseCase @Inject constructor(private val repository: AdminRepository) {
    operator suspend fun invoke(id: String) = repository.deleteAccount(id)
}
