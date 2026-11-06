package com.mcl.mcllendingapp.presentation.login

data class LoginUiState(val email: String = "", val password: String = "", val busy: Boolean = false,
    val error: String? = null)
