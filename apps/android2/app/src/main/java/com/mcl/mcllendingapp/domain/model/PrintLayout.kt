package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class PrintLayout(val paper: String = "template", val orientation: String = "portrait",
    val widthMm: Double = 210.0, val heightMm: Double = 297.0, val marginMm: Double = 12.7,
    val fontSize: Double = 12.0)
