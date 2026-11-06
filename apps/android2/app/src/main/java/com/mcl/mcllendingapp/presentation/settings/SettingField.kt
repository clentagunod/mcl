package com.mcl.mcllendingapp.presentation.settings

data class SettingField(
    val key: String,
    val label: String,
    val kind: String = "text",
    val choices: List<Pair<String, String>> = emptyList(),
    val hint: String = "",
    val maxLength: Int = 1500,
)
