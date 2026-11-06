package com.mcl.mcllendingapp.presentation.printables

data class PrintablesEvent(
    val action: PrintablesAction,
    val text: String = "",
    val number: Double = 0.0,
    val enabled: Boolean = false
)
