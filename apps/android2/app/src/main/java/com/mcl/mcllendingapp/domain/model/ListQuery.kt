package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class ListQuery(val search: String = "", val status: String = "all",
    val page: Int = 0, val pageSize: Int = 25, val sort: String = "default", val role: String = "all")
