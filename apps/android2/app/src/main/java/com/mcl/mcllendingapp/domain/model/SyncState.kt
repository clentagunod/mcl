package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class SyncState(val loading: Boolean = false, val complete: Boolean = false,
    val fresh: Boolean = false, val lastSyncedAt: Long? = null, val error: String? = null,
    val progress: String = "") {
    val canWrite: Boolean get() = complete && fresh && !loading && error == null
}
