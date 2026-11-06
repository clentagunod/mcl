package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.DocumentRequest
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import javax.inject.Inject

/** Streams every selected borrower into an HTML, DOCX, or DOCX bundle artifact. */
class ExportDocumentUseCase @Inject constructor(private val repository: DocumentRepository) {
    suspend operator fun invoke(request: DocumentRequest, format: String) = repository.export(request, format)
}
