package com.mcl.mcllendingapp.data.remote

@kotlinx.serialization.Serializable
data class TrashSelection(val id: String, val trashId: String? = null, val requestId: String)
