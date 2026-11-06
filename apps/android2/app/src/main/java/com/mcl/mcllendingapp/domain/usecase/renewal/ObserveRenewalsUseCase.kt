package com.mcl.mcllendingapp.domain.usecase.renewal

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Renewals through the authorized repository. */
class ObserveRenewalsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(clientId: String, page: Int = 0) = repository.observeRenewals(clientId, page)
}
