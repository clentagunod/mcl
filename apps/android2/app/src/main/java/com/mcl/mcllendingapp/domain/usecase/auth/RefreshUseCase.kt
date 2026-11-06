package com.mcl.mcllendingapp.domain.usecase.auth

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Refresh through the authorized repository. */
class RefreshUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke() = repository.refresh()
}
