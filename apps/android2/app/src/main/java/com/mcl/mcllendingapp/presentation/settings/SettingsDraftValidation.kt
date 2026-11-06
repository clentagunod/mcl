package com.mcl.mcllendingapp.presentation.settings

import com.mcl.mcllendingapp.domain.model.AppSettings

data class SettingsDraftValidation(
    val value: AppSettings? = null,
    val errors: Map<String, String> = emptyMap(),
)
