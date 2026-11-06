package com.mcl.mcllendingapp.domain.model

import org.junit.Assert.*
import org.junit.Test

class LoanMathTest {
    @Test fun approvalIsExcludedAndSundaysAndHolidaysDoNotCount() {
        val result=LoanMath.schedule("2026-11-02",45,setOf("2026-11-03"),"2026-11-04")
        assertEquals(1,result.daysElapsed)
        assertTrue(result.dueDate>"2026-12-20")
    }

    @Test fun sameDayDueIsDueAndExactSettlementIsPaid() {
        val client=Client(principal=100.0,interest=15.0,loanTermDays=45,approvalDate="2026-01-01")
        val due=LoanMath.schedule(client.approvalDate,45,emptySet()).dueDate
        assertEquals("due",LoanMath.summarize(client,11499,null,emptySet(),due).status)
        assertEquals("paid",LoanMath.summarize(client,11500,due,emptySet(),due).status)
        assertEquals(0.01,LoanMath.summarize(client,11499,null,emptySet(),due).outstanding,0.0)
    }

    @Test fun dailySuggestedAmountRoundsUpToCentavo() {
        assertEquals(2.56,LoanMath.dailyPayable(Client(principal=100.0,interest=15.0,loanTermDays=45)),0.0)
    }

    @Test fun invalidLoanTermsFailValidationBeforeDailyCalculation() {
        val client=Client(firstName="Maria",lastName="Santos",address="Tagum",
            cellphone="09171234567",principal=100.0,interest=15.0,approvalDate="2026-01-01")
        for(term in listOf(0,-1,44)) {
            val error=assertThrows(IllegalArgumentException::class.java) {
                LoanMath.validateClient(client.copy(loanTermDays=term))
            }
            assertEquals("Choose a valid loan term and approval date.",error.message)
            assertThrows(IllegalArgumentException::class.java) {
                LoanMath.dailyPayable(client.copy(loanTermDays=term))
            }
        }
    }

    @Test fun integerCentavosPreserveAggregateAmountsBeyondSingleRecordLimit() {
        assertEquals(199_999_999_800L,LoanMath.cents(1_999_999_998.0))
        assertEquals(0.3,LoanMath.pesos(LoanMath.cents(0.1)+LoanMath.cents(0.2)),0.0)
    }

    @Test fun collectorMinimumDoesNotBlockAdminFinalSettlement() {
        val client=Client(principal=100.0,interest=0.0,dailyAmount=10.0,
            outstanding=5.0,approvalDate="2026-01-01")
        LoanMath.validatePayment(5.0,"2026-01-02",client,true,"admin")
        assertThrows(IllegalArgumentException::class.java) {
            LoanMath.validatePayment(5.0,"2026-01-02",client,true,"collector")
        }
    }

    @Test fun invalidMoneyAndImpossibleDatesAreRejected() {
        assertThrows(IllegalArgumentException::class.java) { LoanMath.money(Double.POSITIVE_INFINITY) }
        assertThrows(ArithmeticException::class.java) { LoanMath.money(0.001) }
        assertFalse(LoanMath.validDate("2026-02-30"))
    }

    @Test fun overduePaidLoanCannotBeRenewedBeforeItsSettlement() {
        assertThrows(IllegalArgumentException::class.java) {
            LoanMath.validateRenewal(RenewalTerms(100.0,15.0,2.56,45,"2026-01-01"),"2026-01-02")
        }
    }
}
