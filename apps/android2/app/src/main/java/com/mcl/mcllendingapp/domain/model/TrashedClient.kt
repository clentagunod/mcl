package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class TrashedClient(val id: String = "", val client: Client = Client(), val trashId: String = "",
    val deletedAt: Long? = null, val deletedByName: String = "", val status: String = "trashed")
