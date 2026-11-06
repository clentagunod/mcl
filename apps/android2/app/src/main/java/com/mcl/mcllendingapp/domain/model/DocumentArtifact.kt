package com.mcl.mcllendingapp.domain.model

data class DocumentArtifact(
    val path: String,
    val filename: String,
    val mimeType: String,
    val widthMm: Double = 210.0,
    val heightMm: Double = 297.0
)
