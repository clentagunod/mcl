package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.LoanMath
import com.mcl.mcllendingapp.domain.model.Payment
import java.math.BigDecimal
import java.math.RoundingMode
import javax.inject.Inject

/** Groups current-cycle receipts into paying dates and retains the actual payoff receipt amount. */
class BuildIndexPaymentDaysUseCase @Inject constructor() {
    operator fun invoke(client: Client, payments: List<Payment>): List<Pair<String, Double>> {
        val cycle = client.activeLoanId.ifBlank { "initial" }
        val dates = payments.filter { it.clientId == client.id && it.loanId.ifBlank { "initial" } == cycle &&
            it.amount.isFinite() && it.amount > 0 && LoanMath.validDate(it.paymentDate) }.groupBy { it.paymentDate }.toSortedMap()
        var remaining = BigDecimal.valueOf(client.principal).add(BigDecimal.valueOf(client.interest)).setScale(2, RoundingMode.HALF_UP)
        return buildList {
            dates.forEach { (date, receipts) ->
                if (remaining.signum() > 0) {
                    val amount = receipts.fold(BigDecimal.ZERO) { total, receipt -> total + BigDecimal.valueOf(receipt.amount) }.setScale(2, RoundingMode.HALF_UP)
                    add(date to amount.toDouble())
                    remaining -= amount
                }
            }
        }
    }
}
