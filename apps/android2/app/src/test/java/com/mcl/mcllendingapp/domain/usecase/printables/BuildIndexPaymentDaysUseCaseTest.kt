package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.Payment
import org.junit.Assert.assertEquals
import org.junit.Test

class BuildIndexPaymentDaysUseCaseTest {
    private val useCase = BuildIndexPaymentDaysUseCase()
    private val client = Client(id = "borrower", principal = 100.0, interest = 20.0)

    @Test fun sameDateReceiptsCombineAndMissedDatesDoNotCreateGaps() {
        val days = useCase(client, listOf(
            Payment(clientId = client.id, paymentDate = "2026-11-04", amount = 15.0),
            Payment(clientId = client.id, paymentDate = "2026-11-01", amount = 10.0),
            Payment(clientId = client.id, paymentDate = "2026-11-04", amount = 5.0)
        ))
        assertEquals(listOf("2026-11-01" to 10.0, "2026-11-04" to 20.0), days)
    }

    @Test fun renewalExcludesPreviousLoanAndOtherBorrowers() {
        val current = client.copy(activeLoanId = "00002")
        assertEquals(listOf("2026-11-04" to 25.0), useCase(current, listOf(
            Payment(clientId = client.id, paymentDate = "2026-11-01", amount = 120.0),
            Payment(clientId = "someone-else", loanId = "00002", paymentDate = "2026-11-04", amount = 99.0),
            Payment(clientId = client.id, loanId = "00002", paymentDate = "2026-11-04", amount = 25.0)
        )))
    }

    @Test fun payoffIncludesHistoricalOverpaymentAndStopsLaterDays() {
        val days = useCase(client, listOf(
            Payment(clientId = client.id, paymentDate = "2026-11-01", amount = 100.0),
            Payment(clientId = client.id, paymentDate = "2026-11-02", amount = 25.0),
            Payment(clientId = client.id, paymentDate = "2026-11-03", amount = 10.0)
        ))
        assertEquals(listOf("2026-11-01" to 100.0, "2026-11-02" to 25.0), days)
    }

    @Test fun legacyBlankLoanIdentifierBelongsToInitialLoan() {
        assertEquals(listOf("2026-11-01" to 20.0), useCase(client, listOf(
            Payment(clientId = client.id, loanId = "", paymentDate = "2026-11-01", amount = 20.0),
            Payment(clientId = client.id, paymentDate = "2026-99-99", amount = 20.0)
        )))
    }
}
