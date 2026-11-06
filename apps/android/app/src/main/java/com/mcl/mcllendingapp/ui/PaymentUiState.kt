package com.mcl.mcllendingapp.ui

import com.mcl.mcllendingapp.data.Client
import com.mcl.mcllendingapp.data.LoanBalance
import com.mcl.mcllendingapp.data.todayDate

data class PaymentUiState(
    val client: Client,
    val date: String = todayDate(),
    val receiptId: String = java.util.UUID.randomUUID().toString(),
    val amount: String = "",
    val balance: LoanBalance? = null,
    val loading: Boolean = true,
    val saving: Boolean = false,
    val submitted: Boolean = false,
    val error: String? = null,
)
