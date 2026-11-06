package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class IndexSettings(val businessName: String = "MCL Lending",
    val branch: String = "San Miguel, Tagum City", val mobile: String = "09758143163",
    val amountBasis: String = "total", val headingColor: String = "#f5efa5", val cellColor: String = "#a1bfcd")
