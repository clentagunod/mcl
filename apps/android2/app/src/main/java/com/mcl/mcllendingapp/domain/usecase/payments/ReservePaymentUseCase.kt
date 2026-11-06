package com.mcl.mcllendingapp.domain.usecase.payments

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Reserve Payment through the authorized repository. */
class ReservePaymentUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(client: Client, amount: Double, date: String, notes: String) = repository.reservePayment(client, amount, date, notes)
}
