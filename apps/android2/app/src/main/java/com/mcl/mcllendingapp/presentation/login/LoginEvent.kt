package com.mcl.mcllendingapp.presentation.login

sealed interface LoginEvent {
    data class Email(val value: String): LoginEvent
    data class Password(val value: String): LoginEvent
    data class ImportConfig(val uri: android.net.Uri): LoginEvent
    data object Submit: LoginEvent
}
