package com.mcl.mcllendingapp.presentation.dashboard

import java.time.LocalDate

fun collectionTrend(today: String, days: Int, amounts: Map<String, Double>, receipts: Map<String, Int>): List<DailyCollectionPoint> {
    require(days in listOf(7, 14, 30))
    val end = LocalDate.parse(today)
    return (days - 1 downTo 0).map { offset ->
        val date = end.minusDays(offset.toLong()).toString()
        DailyCollectionPoint(date, amounts[date] ?: 0.0, receipts[date] ?: 0)
    }
}
