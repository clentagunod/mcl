package com.mcl.mcllendingapp.domain.usecase.payments

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Payments through the authorized repository. */
class ObservePaymentsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(clientId: String, loanId: String?, page: Int = 0) = repository.observePayments(clientId = clientId, loanId = loanId, page = page)
}
