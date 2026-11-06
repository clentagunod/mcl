package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import javax.inject.Inject

/** Copies a completed artifact to the user-selected document destination. */
class SaveDocumentUseCase @Inject constructor(private val repository: DocumentRepository) {
    suspend operator fun invoke(artifact: DocumentArtifact, destination: String) = repository.save(artifact, destination)
}
