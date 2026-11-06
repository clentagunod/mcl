package com.mcl.mcllendingapp.presentation.dashboard

import org.junit.Assert.*
import org.junit.Test

class CollectionTrendTest {
    @Test fun sevenDaysIncludeTodayAndCrossLeapDay() {
        val points = collectionTrend("2028-03-01", 7, emptyMap(), emptyMap())
        assertEquals("2028-02-24", points.first().date)
        assertEquals("2028-03-01", points.last().date)
        assertTrue(points.any { it.date == "2028-02-29" })
        assertEquals(7, points.size)
    }

    @Test fun fillsMissingDatesAndKeepsReceiptCountsSeparateFromAmounts() {
        val points = collectionTrend("2026-11-04", 7, mapOf("2026-11-04" to 300.0), mapOf("2026-11-04" to 3))
        assertEquals(6, points.count { it.amount == 0.0 && it.receipts == 0 })
        assertEquals(DailyCollectionPoint("2026-11-04", 300.0, 3), points.last())
    }

    @Test fun excludesOlderAndFutureDatesFromPeriodTotals() {
        val amounts = mapOf("2026-10-05" to 500.0, "2026-10-06" to 10.0, "2026-11-04" to 20.0, "2026-11-05" to 900.0)
        val points = collectionTrend("2026-11-04", 30, amounts, emptyMap())
        assertEquals("2026-10-06", points.first().date)
        assertEquals(30.0, points.sumOf { it.amount }, 0.001)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnsupportedChartRange() {
        collectionTrend("2026-11-04", 90, emptyMap(), emptyMap())
    }
}
