package com.mcl.mcllendingapp.data.remote

@kotlinx.serialization.Serializable
data class TrashRequest(val operation: String, val entries: List<TrashSelection>, val completed: Int = 0)
