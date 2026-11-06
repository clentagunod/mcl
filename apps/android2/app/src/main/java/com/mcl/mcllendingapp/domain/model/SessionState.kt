package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class SessionState(val account: UserAccount? = null, val loading: Boolean = true, val error: String? = null) {
    val authorized: Boolean get() = account?.active == true && error == null
    val isAdmin: Boolean get() = account?.isAdmin == true && authorized
}
