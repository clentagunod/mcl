package com.mcl.mcllendingapp

import com.mcl.mcllendingapp.data.*
import java.math.BigDecimal
import org.junit.Assert.*
import org.junit.Test

class LoanCycleTest {
    @Test fun legacyDefaultsRemainOriginal() {
        assertEquals("initial", Client("c", "", "", "").activeLoanId)
        assertEquals("initial", Payment("p", "c", BigDecimal.TEN, "2026-01-02").loanId)
    }
    @Test fun sameDateAcrossCyclesDoesNotReduceNewBalance() {
        val receipts = listOf(
            Payment("old", "c", BigDecimal("1100"), "2026-01-02"),
            Payment("new", "c", BigDecimal("200"), "2026-01-02", "00002"),
            Payment("other", "other", BigDecimal("999"), "2026-01-02", "00002"))
        val current = currentLoanPayments("c", "00002", receipts)
        assertEquals(listOf("new"), current.map { it.id })
        val balance = LoanBalance(BigDecimal("1000"), BigDecimal("100"),
            current.fold(BigDecimal.ZERO) { total, p -> total + p.amount },
            BigDecimal("200"), "2026-01-02", "00002")
        assertEquals(BigDecimal("900"), balance.outstanding)
        assertEquals(3, receipts.size)
    }
}
