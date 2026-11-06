package com.mcl.mcllendingapp.presentation.dashboard

import androidx.compose.runtime.Immutable

@Immutable
data class CollectorActivityItem(val id: String, val name: String, val count: Int, val amount: Double, val lastEntry: Long?)
