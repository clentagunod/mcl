package com.mcl.mcllendingapp.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.RawQuery
import androidx.sqlite.db.SupportSQLiteQuery
import kotlinx.coroutines.flow.Flow

@Dao
interface CacheDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(records: List<CacheRecord>)
    @Query("SELECT * FROM records WHERE owner = :owner AND kind = :kind AND id = :id LIMIT 1")
    suspend fun record(owner: String, kind: String, id: String): CacheRecord?
    @RawQuery suspend fun rows(query: SupportSQLiteQuery): List<CacheRecord>
    @RawQuery suspend fun number(query: SupportSQLiteQuery): Long
    @RawQuery suspend fun groups(query: SupportSQLiteQuery): List<ScalarRow>
    @Query("SELECT COUNT(*) FROM records WHERE owner = :owner")
    fun changes(owner: String): Flow<Int>
    @Query("DELETE FROM records WHERE owner = :owner AND kind = :kind AND generation != :generation")
    suspend fun removeUnseen(owner: String, kind: String, generation: Long)
    @Query("DELETE FROM records WHERE owner = :owner AND kind = 'payments' AND parentId = :clientId AND generation != :generation")
    suspend fun removeUnseenPayments(owner: String, clientId: String, generation: Long)
    @Query("DELETE FROM records WHERE owner = :owner AND (kind IN ('accounts','trash') OR kind LIKE 'renewals:%' OR (kind = 'settings' AND id != 'settings/Configurations/elements/paymentPolicy'))")
    suspend fun removePrivileged(owner: String)
    @Query("DELETE FROM records WHERE owner = :owner AND kind NOT IN ('legacyReceipts','trashRequests')")
    suspend fun clear(owner: String)
    @Query("DELETE FROM records WHERE owner = :owner AND kind IN ('clients','payments','holidays','accounts','trash','settings')")
    suspend fun clearSyncedSnapshot(owner: String)
    @Query("UPDATE OR REPLACE records SET owner = :owner WHERE owner = :staging AND kind IN ('clients','payments','holidays','accounts','trash','settings')")
    suspend fun promoteSyncedSnapshot(staging: String, owner: String)
    @Query("DELETE FROM records WHERE owner = :owner AND kind = :kind")
    suspend fun clearKind(owner: String, kind: String)
    @Query("UPDATE OR REPLACE records SET owner = :owner WHERE owner = :staging AND kind = :kind")
    suspend fun promoteKind(staging: String, owner: String, kind: String)
    @Query("DELETE FROM records WHERE owner = :staging")
    suspend fun discardStagedSnapshot(staging: String)
    @Query("DELETE FROM records WHERE substr(owner,1,length(:prefix)) = :prefix AND (kind IN ('clients','payments','holidays','accounts','trash','settings') OR kind LIKE 'renewals:%')")
    suspend fun discardAbandonedStaging(prefix: String)
    @Query("DELETE FROM records WHERE owner = :owner AND kind = :kind AND id = :id")
    suspend fun remove(owner: String, kind: String, id: String)
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun reserve(receipt: PendingReceiptEntity)
    @Query("SELECT * FROM pending_receipts WHERE owner = :owner AND (:clientId IS NULL OR clientId = :clientId) ORDER BY createdAt")
    fun pending(owner: String, clientId: String?): Flow<List<PendingReceiptEntity>>
    @Query("SELECT * FROM pending_receipts WHERE owner = :owner AND clientId = :clientId LIMIT 1")
    suspend fun pendingForClient(owner: String, clientId: String): PendingReceiptEntity?
    @Query("SELECT * FROM pending_receipts WHERE owner = :owner AND id = :id LIMIT 1")
    suspend fun pendingById(owner: String, id: String): PendingReceiptEntity?
    @Query("DELETE FROM pending_receipts WHERE owner = :owner AND id = :id")
    suspend fun confirm(owner: String, id: String)
}
