package com.mcl.mcllendingapp.presentation.collectors

import androidx.compose.runtime.Immutable

@Immutable
data class AccountDraft(
    val uid: String? = null,
    val role: String = "collector",
    val fullName: String = "",
    val email: String = "",
    val phone: String = "",
    val password: String = "",
)
