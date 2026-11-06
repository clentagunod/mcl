package com.mcl.mcllendingapp.domain.model

data class DashboardStats(val totalClients: Int = 0, val dueClients: Int = 0,
    val pendingClients: Int = 0, val paidClients: Int = 0, val totalPrincipal: Double = 0.0,
    val totalInterest: Double = 0.0, val totalPayable: Double = 0.0,
    val totalPaid: Double = 0.0, val totalOutstanding: Double = 0.0,
    val todayCollection: Double = 0.0, val monthCollection: Double = 0.0,
    val activeCollectors: Int = 0, val collectionRate: Double = 0.0,
    val due: List<Client> = emptyList(), val recentPayments: List<Payment> = emptyList(),
    val monthlyCollections: Map<String, Double> = emptyMap(),
    val collectorCollections: Map<String, Double> = emptyMap(),
    val dailyReceiptCounts: Map<String, Int> = emptyMap(),
    val collectorReceiptCounts: Map<String, Int> = emptyMap(),
    val collectorLastEntry: Map<String, Long> = emptyMap(),
    val collectorNames: Map<String, String> = emptyMap(),
    val recentClientNames: Map<String, String> = emptyMap())
