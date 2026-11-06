package com.mcl.mcllendingapp.presentation.dashboard

import androidx.compose.runtime.Immutable

@Immutable
data class LoanStatusSegment(val label: String, val count: Int, val percent: Int, val tone: String)
