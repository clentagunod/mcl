package com.mcl.mcllendingapp

import com.mcl.mcllendingapp.data.*
import org.junit.Assert.*
import org.junit.Test
import java.math.BigDecimal

class LoanPaymentTest {
    private val balance = LoanBalance(BigDecimal("1000.00"), BigDecimal("100.00"),
        BigDecimal("200.00"), BigDecimal("20.00"), "2026-01-01")

    @Test fun outstandingMatchesWebLedger() {
        assertEquals(BigDecimal("900.00"), balance.outstanding)
        assertEquals(BigDecimal("874.75"),
            balance.copy(totalPaid = balance.totalPaid + parsePayment("25.25")).outstanding)
    }

    @Test fun rejectsInvalidAndNonPositiveAmounts() {
        listOf("", "0", "-10", "1.001", "NaN", "1e3", "12,50", "999999999999999999999").forEach {
            try { parsePayment(it); fail("Accepted invalid amount: $it") } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun acceptsExactRemainingBalance() {
        validatePayment(parsePayment("900"), balance, "2026-01-02")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsOverpayment() { validatePayment(parsePayment("900.01"), balance, "2026-01-02") }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsBeforeApproval() { validatePayment(parsePayment("10"), balance, "2025-12-31") }

    @Test fun fullyPaidBalanceIsZero() {
        assertEquals(0, balance.copy(totalPaid = BigDecimal("1200.00")).outstanding.compareTo(BigDecimal.ZERO))
    }
}
