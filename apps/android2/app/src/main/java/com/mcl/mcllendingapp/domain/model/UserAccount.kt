package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class UserAccount(val uid: String = "", val fullName: String = "", val email: String = "",
    val phone: String = "", val role: String = "collector", val active: Boolean = true,
    val createdAt: Long? = null) {
    val isAdmin: Boolean get() = role == "admin" || role == "developer"
}
