package com.mcl.mcllendingapp.domain.repository

import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.model.DocumentPreview
import com.mcl.mcllendingapp.domain.model.DocumentRequest

interface DocumentRepository {
    suspend fun preview(request: DocumentRequest): DocumentPreview
    suspend fun export(request: DocumentRequest, format: String): DocumentArtifact
    suspend fun save(artifact: DocumentArtifact, destination: String)
    fun discard(artifact: DocumentArtifact)
}
