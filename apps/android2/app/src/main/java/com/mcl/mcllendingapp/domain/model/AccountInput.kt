package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class AccountInput(val role: String = "collector", val fullName: String = "",
    val email: String = "", val phone: String = "", val password: String = "")
