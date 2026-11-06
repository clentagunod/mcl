package com.mcl.mcllendingapp.domain.usecase.payments

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Observe Pending Receipts through the authorized repository. */
class ObservePendingReceiptsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(clientId: String) = repository.observePendingReceipts(clientId)
}
