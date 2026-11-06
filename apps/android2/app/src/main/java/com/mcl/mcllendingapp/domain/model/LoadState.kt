package com.mcl.mcllendingapp.domain.model

sealed class LoadState<out T> {
    data object Loading : LoadState<Nothing>()
    data class Success<T>(val data: T) : LoadState<T>()
    data object Empty : LoadState<Nothing>()
    data class Error(val message: String) : LoadState<Nothing>()
}
