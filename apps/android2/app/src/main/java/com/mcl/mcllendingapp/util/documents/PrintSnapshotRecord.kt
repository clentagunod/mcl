package com.mcl.mcllendingapp.util.documents

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.Payment
import kotlinx.serialization.Serializable

@Serializable
data class PrintSnapshotRecord(val client: Client, val payments: List<Payment>)
