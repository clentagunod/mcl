package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.DocumentRequest
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import javax.inject.Inject

/** Builds a bounded preview of the selected document without subscribing to the ledger. */
class PrepareDocumentUseCase @Inject constructor(private val repository: DocumentRepository) {
    suspend operator fun invoke(request: DocumentRequest) = repository.preview(request)
}
