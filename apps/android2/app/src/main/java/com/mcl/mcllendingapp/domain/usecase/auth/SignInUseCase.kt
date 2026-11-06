package com.mcl.mcllendingapp.domain.usecase.auth

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Sign In through the authorized repository. */
class SignInUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(email: String, password: String) = repository.signIn(email, password)
}
