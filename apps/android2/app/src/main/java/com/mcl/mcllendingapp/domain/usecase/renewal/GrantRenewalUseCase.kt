package com.mcl.mcllendingapp.domain.usecase.renewal

import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject

/** Grant Renewal through the authorized repository. */
class GrantRenewalUseCase @Inject constructor(private val repository: AdminRepository) {
    suspend operator fun invoke(client: Client, terms: RenewalTerms, notes: String) = repository.renewClient(client, terms, notes)
}
