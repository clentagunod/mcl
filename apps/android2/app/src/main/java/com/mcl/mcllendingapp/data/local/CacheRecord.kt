package com.mcl.mcllendingapp.data.local

import androidx.room.Entity
import androidx.room.Index

@Entity(tableName = "records", primaryKeys = ["owner", "kind", "id"],
    indices = [Index(value = ["owner", "kind", "sortKey"]), Index(value = ["owner", "kind", "parentId", "loanId", "date"])])
data class CacheRecord(
    val owner: String, val kind: String, val id: String, val payload: String,
    val raw: String = "{}", val details: String = "", val search: String = "", val sortKey: String = "",
    val status: String = "", val parentId: String = "", val loanId: String = "",
    val date: String = "", val amountCents: Long = 0, val extraCents: Long = 0,
    val createdAt: Long = 0, val generation: Long = 0,
)
