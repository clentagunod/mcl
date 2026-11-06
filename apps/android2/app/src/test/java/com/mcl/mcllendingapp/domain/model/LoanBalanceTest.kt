package com.mcl.mcllendingapp.domain.model

import org.junit.Assert.*
import org.junit.Test

class LoanBalanceTest {
    @Test fun competingReceiptMustUseNewOutstandingAfterVersionConflict() {
        val baseline = LoanBalance("initial", 0, 3)
        val first = baseline.receive(7500, 10000)
        assertEquals(2500, first.outstanding(10000))
        assertEquals(4, first.revision)
        assertThrows(IllegalStateException::class.java) { first.receive(7500, 10000) }
    }

    @Test fun correctionAndFinancialEditInvalidateRenewalReviewEvenIfPaidReturnsToSameAmount() {
        val baseline = LoanBalance("initial", 10000, 5)
        val corrected = baseline.remove(1000).receive(1000, 10000)
        assertEquals(baseline.paidCents, corrected.paidCents)
        assertThrows(IllegalStateException::class.java) { corrected.requireUnchanged(baseline) }
        assertThrows(IllegalStateException::class.java) { baseline.adjust(10000).requireUnchanged(baseline) }
    }

    @Test fun repaymentCorrectionCannotSubtractTwiceOrMakeBalanceNegative() {
        val corrected = LoanBalance("initial", 1000, 0).remove(1000)
        assertEquals(0, corrected.paidCents)
        assertThrows(IllegalStateException::class.java) { corrected.remove(1000) }
    }

    @Test fun integerLedgerRejectsFractionalOrFloatingFieldsAndMissingValues() {
        val valid = mapOf<String, Any?>("loanId" to "initial", "paidCents" to 500L, "revision" to 1L)
        assertEquals(LoanBalance("initial", 500, 1), LoanBalance.fromFields(valid))
        listOf(0.5, 500.0, "500", null).forEach { invalid ->
            assertThrows(IllegalStateException::class.java) { LoanBalance.fromFields(valid + ("paidCents" to invalid)) }
            assertThrows(IllegalStateException::class.java) { LoanBalance.fromFields(valid + ("revision" to invalid)) }
        }
        assertThrows(IllegalStateException::class.java) { LoanBalance.fromFields(null) }
        assertThrows(IllegalArgumentException::class.java) { LoanBalance("initial", -1, 0) }
    }

    @Test fun reducedLoanTotalCannotDropBelowAlreadyCollectedAmount() {
        val current = LoanBalance("initial", 10000, 2)
        assertThrows(IllegalStateException::class.java) { current.adjust(9999) }
        assertEquals(10000, current.adjust(15000).paidCents)
    }

    @Test fun renewalRequiresExactSettlementAndAdvancesRevisionWhileResettingNewCycle() {
        val current = LoanBalance("initial", 10000, 8)
        assertEquals(LoanBalance("00002", 0, 9), current.renew("00002", 10000))
        assertThrows(IllegalStateException::class.java) { current.renew("00002", 10001) }
        assertThrows(IllegalStateException::class.java) { current.renew("initial", 10000) }
    }

    @Test fun revisionOverflowFailsInsteadOfWrapping() {
        assertThrows(ArithmeticException::class.java) {
            LoanBalance("initial", 0, Long.MAX_VALUE).receive(1, 100)
        }
    }
}
