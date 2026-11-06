package com.mcl.mcllendingapp.domain.usecase.auth

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Sign Out through the authorized repository. */
class SignOutUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke() = repository.signOut()
}
