package com.mcl.mcllendingapp.domain.model

data class DocumentRequest(
    val kind: String,
    val selection: PrintSelection,
    val layout: PrintLayout,
    val settings: AppSettings,
    val date: String,
    val previewIndex: Int = 0
)
