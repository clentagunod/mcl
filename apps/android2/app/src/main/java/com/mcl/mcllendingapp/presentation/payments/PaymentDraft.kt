package com.mcl.mcllendingapp.presentation.payments

import kotlinx.serialization.Serializable

@Serializable
data class PaymentDraft(val amount: String = "", val date: String = "", val notes: String = "", val showForm: Boolean = false)
