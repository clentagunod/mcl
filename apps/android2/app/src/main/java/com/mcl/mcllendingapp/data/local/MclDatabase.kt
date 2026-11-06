package com.mcl.mcllendingapp.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [CacheRecord::class, PendingReceiptEntity::class], version = 1, exportSchema = true)
abstract class MclDatabase : RoomDatabase() {
    abstract fun cache(): CacheDao
}
