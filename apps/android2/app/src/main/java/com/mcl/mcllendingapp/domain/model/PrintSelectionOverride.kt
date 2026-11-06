package com.mcl.mcllendingapp.domain.model

data class PrintSelectionOverride(
    val selected: Boolean,
    val query: String? = null,
    val clientId: String? = null,
    val clientSearchText: String = ""
)
