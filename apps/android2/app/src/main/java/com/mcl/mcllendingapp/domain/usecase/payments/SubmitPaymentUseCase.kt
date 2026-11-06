package com.mcl.mcllendingapp.domain.usecase.payments

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Submit Payment through the authorized repository. */
class SubmitPaymentUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(attempt: ReceiptAttempt) = repository.submitPayment(attempt)
}
