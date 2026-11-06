package com.mcl.mcllendingapp.data.local

import androidx.room.Entity
import androidx.room.Index

@Entity(tableName = "pending_receipts", primaryKeys = ["owner", "id"],
    indices = [Index(value = ["owner", "clientId"])])
data class PendingReceiptEntity(val owner: String, val id: String, val clientId: String,
    val payload: String, val createdAt: Long)
