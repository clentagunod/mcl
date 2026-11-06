package com.mcl.mcllendingapp.presentation.dashboard

import androidx.compose.runtime.Immutable

@Immutable
data class DailyCollectionPoint(val date: String, val amount: Double, val receipts: Int)
