package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class TrashSettings(val autoDeleteDays: Int = 0)
