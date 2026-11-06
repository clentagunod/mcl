package com.mcl.mcllendingapp.util.documents

import java.io.File

data class PrintSnapshot(
    val file: File,
    val selectedCount: Int,
    val availableCount: Int,
    val total: Double,
    val withCollections: Int,
    val maxTermDays: Int,
    val cached: Boolean,
    val positions: Int = 0,
    val pages: Int = 0
)
