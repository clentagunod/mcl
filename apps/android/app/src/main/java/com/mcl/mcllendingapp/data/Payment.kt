package com.mcl.mcllendingapp.data

import java.math.BigDecimal

/** Legacy receipts belong to the original cycle, never the latest renewed loan. */
data class Payment(
    val id: String,
    val clientId: String,
    val amount: BigDecimal,
    val paymentDate: String,
    val loanId: String = "initial",
)

fun currentLoanPayments(clientId: String, activeLoanId: String, payments: List<Payment>): List<Payment> =
    payments.filter { it.clientId == clientId && it.loanId == activeLoanId }
