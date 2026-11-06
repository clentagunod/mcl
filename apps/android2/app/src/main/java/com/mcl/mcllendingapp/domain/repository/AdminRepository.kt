package com.mcl.mcllendingapp.domain.repository

import com.mcl.mcllendingapp.domain.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface AdminRepository {
    val session: StateFlow<SessionState>
    val syncState: StateFlow<SyncState>
    fun setForeground(visible: Boolean)
    suspend fun configureFirebase(json: String)
    suspend fun importLegacyReceipts(entries: Map<String,String>)
    suspend fun signIn(email: String, password: String)
    fun signOut()
    suspend fun refresh()
    fun observeClients(query: ListQuery = ListQuery()): Flow<Page<Client>>
    suspend fun clientsPage(query: ListQuery = ListQuery()): Page<Client>
    fun observeClient(id: String): Flow<Client?>
    suspend fun getClient(id: String): Client?
    fun observePayments(clientId: String? = null, loanId: String? = null, date: String? = null,
        page: Int = 0, pageSize: Int = 25): Flow<Page<Payment>>
    suspend fun paymentsPage(clientId: String? = null, loanId: String? = null, date: String? = null,
        page: Int = 0, pageSize: Int = 25): Page<Payment>
    fun observePendingReceipts(clientId: String? = null): Flow<List<ReceiptAttempt>>
    fun observeRenewals(clientId: String, page: Int = 0, pageSize: Int = 25): Flow<Page<RenewalRecord>>
    suspend fun renewalsPage(clientId: String, page: Int = 0, pageSize: Int = 25): Page<RenewalRecord>
    suspend fun renewalEligibility(clientId: String): RenewalEligibility
    fun observeAccounts(query: ListQuery = ListQuery()): Flow<Page<UserAccount>>
    fun observeHolidays(query: ListQuery = ListQuery()): Flow<Page<Holiday>>
    fun observeTrash(query: ListQuery = ListQuery()): Flow<Page<TrashedClient>>
    fun observeSettings(): Flow<AppSettings>
    fun observeDashboard(date: String): Flow<DashboardStats>
    fun observeDailySummary(date: String, query: ListQuery = ListQuery()): Flow<Page<DailySummaryRow>>
    fun observeCollectionDays(clientId: String, page: Int = 0, pageSize: Int = 25): Flow<Page<CollectionDay>>
    suspend fun collectionDaysPage(clientId: String, page: Int = 0, pageSize: Int = 25): Page<CollectionDay>
    fun observeConsolidation(query: ListQuery = ListQuery()): Flow<Page<ConsolidationRow>>
    suspend fun dailySummaryPage(date: String, query: ListQuery = ListQuery()): Page<DailySummaryRow>
    suspend fun consolidationPage(query: ListQuery = ListQuery()): Page<ConsolidationRow>
    suspend fun matchingIds(kind: String, query: ListQuery): List<String>
    suspend fun saveClient(input: Client, expected: Client? = null)
    suspend fun reservePayment(client: Client, amount: Double, date: String, notes: String): ReceiptAttempt
    suspend fun submitPayment(attempt: ReceiptAttempt)
    suspend fun deletePayment(expected: Payment)
    suspend fun renewClient(client: Client, terms: RenewalTerms, notes: String)
    suspend fun trashClients(ids: List<String>)
    suspend fun restoreClients(ids: List<String>)
    suspend fun purgeClients(ids: List<String>)
    suspend fun addAccount(input: AccountInput)
    suspend fun saveAccount(account: UserAccount)
    suspend fun setAccountActive(id: String, active: Boolean)
    suspend fun deleteAccount(id: String)
    suspend fun resetPassword(email: String)
    suspend fun saveHoliday(holiday: Holiday)
    suspend fun deleteHoliday(date: String)
    suspend fun saveSettings(settings: AppSettings, expectedRevision: String)
    suspend fun initializeSettings()
    suspend fun completeClientRecords()
}
