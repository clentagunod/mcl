package com.mcl.mcllendingapp.domain.model

data class DocumentPreview(
    val html: String,
    val pageCount: Int,
    val widthMm: Double,
    val heightMm: Double,
    val selectedCount: Int,
    val position: Int,
    val positions: Int,
    val cached: Boolean = false
)
