package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import javax.inject.Inject

/** Removes the temporary document after saving, cancellation, or printing. */
class DiscardDocumentUseCase @Inject constructor(private val repository: DocumentRepository) {
    operator fun invoke(artifact: DocumentArtifact) = repository.discard(artifact)
}
