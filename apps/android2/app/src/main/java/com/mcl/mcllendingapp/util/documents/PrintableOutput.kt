package com.mcl.mcllendingapp.util.documents

data class PrintableOutput(
    val html: String,
    val pageCount: Int,
    val widthMm: Double,
    val heightMm: Double
)
