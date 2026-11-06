package com.mcl.mcllendingapp.data.repository

import androidx.room.withTransaction
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import com.mcl.mcllendingapp.data.local.*
import com.mcl.mcllendingapp.data.mapper.RecordMapper
import com.mcl.mcllendingapp.data.mapper.SettingsMapper
import com.mcl.mcllendingapp.data.mapper.FirestoreCodec
import com.mcl.mcllendingapp.data.remote.FirestoreSource
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class FirebaseAdminRepository @Inject constructor(
    private val configuration: com.mcl.mcllendingapp.data.remote.FirebaseConfiguration, private val database: MclDatabase,
    private val mapper: RecordMapper, private val queries: CacheQueries, private val source: FirestoreSource,
    private val mutations: FirestoreMutations, private val trash: TrashMutations,
    private val settingsMapper: SettingsMapper, private val json: Json,
    private val scheduler: WorkspaceSyncScheduler, @ApplicationContext private val context: Context,
) : AdminRepository {
    private val auth get()=configuration.auth
    private val db get()=configuration.db
    private val dao=database.cache()
    private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
    private val writes=Mutex()
    private val _session=MutableStateFlow(SessionState())
    override val session: StateFlow<SessionState> = _session.asStateFlow()
    private val _sync=MutableStateFlow(SyncState())
    override val syncState: StateFlow<SyncState> = _sync.asStateFlow()
    private var foreground=false
    private var profileListener: ListenerRegistration?=null
    private var liveJob: Job?=null
    private var profileGeneration=0
    private var connectivityRegistered=false
    private val connectivity=context.getSystemService(ConnectivityManager::class.java)
    private val networkCallback=object: ConnectivityManager.NetworkCallback() {
        override fun onLost(network: Network) { markStale("Offline. Cached records remain available; financial actions need server confirmation.") }
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            if(!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) markStale("Waiting for a verified internet connection.")
        }
        override fun onAvailable(network: Network) {
            if(foreground && configuration.currentUid!=null) scope.launch { runCatching { refresh() } }
        }
    }

    init {
        if(configuration.configured) installAuthListener() else _session.value=SessionState(loading=false,error=configuration.missingMessage)
    }

    private fun installAuthListener() {
        auth.addAuthStateListener {
            profileGeneration++
            profileListener?.remove(); profileListener=null
            val user=it.currentUser
            _sync.value=SyncState()
            _session.value=if(user==null) SessionState(loading=false) else SessionState(loading=true)
            if(user!=null) scope.launch {
                val remembered=dao.record(user.uid,"session",user.uid)
                if(remembered!=null && auth.currentUser?.uid==user.uid && _session.value.loading && _session.value.error==null) {
                    val account=runCatching { json.decodeFromString<UserAccount>(remembered.payload) }.getOrNull()
                    if(account?.active==true) {
                        _session.value=SessionState(account,loading=false)
                        val marker=dao.record(user.uid,"syncComplete","complete")
                        if(marker!=null) _sync.value=SyncState(complete=true,fresh=false,lastSyncedAt=marker.createdAt,
                            error="Offline cache. Refresh to confirm current access and balances.")
                    }
                }
            }
            if(foreground && user!=null) attachProfile()
        }
    }

    override fun setForeground(visible: Boolean) {
        foreground=visible
        if(!configuration.configured) return
        if(!visible) {
            profileGeneration++
            profileListener?.remove();profileListener=null
            liveJob?.cancel();liveJob=null
            if(connectivityRegistered) runCatching { connectivity.unregisterNetworkCallback(networkCallback) }
            connectivityRegistered=false
            markStale(null)
            return
        }
        if(!connectivityRegistered) runCatching {
            connectivity.registerDefaultNetworkCallback(networkCallback);connectivityRegistered=true
        }
        scheduler.schedule()
        attachProfile()
        liveJob?.cancel()
        liveJob=scope.launch {
            while(isActive) {
                if(auth.currentUser!=null) runCatching { refresh() }
                delay(300_000)
            }
        }
    }

    private fun markStale(message: String?) {
        _sync.update { it.copy(fresh=false,error=message ?: it.error) }
    }

    private fun attachProfile() {
        profileListener?.remove();profileListener=null
        val uid=auth.currentUser?.uid ?: return
        val generation=++profileGeneration
        profileListener=db.document("users/$uid").addSnapshotListener(MetadataChanges.INCLUDE) { snapshot,error ->
            if(auth.currentUser?.uid!=uid || generation!=profileGeneration || !foreground) return@addSnapshotListener
            if(error!=null) {
                markStale(error.localizedMessage)
                if(_session.value.account==null) _session.value=SessionState(loading=false,error="Access could not be verified. Connect and retry.")
            } else if(snapshot!=null && !snapshot.metadata.isFromCache && !snapshot.metadata.hasPendingWrites()) {
                runCatching { mapper.account(uid,snapshot.data ?: error("No account profile.")) }
                    .onSuccess { account ->
                        if(!account.active) {
                            _session.value=SessionState(loading=false,error="This account is inactive. Contact an administrator.")
                            scope.launch { dao.clear(uid) }
                            markStale("Access revoked.")
                        } else {
                            val changed=_session.value.account!=account
                            _session.value=SessionState(account,loading=false)
                            if(changed) scope.launch { runCatching { refresh() } }
                        }
                    }.onFailure {
                        _session.value=SessionState(loading=false,error=it.message)
                        scope.launch { dao.clear(uid) };markStale(it.message)
                    }
            }
        }
    }

    override suspend fun signIn(email: String,password: String) {
        require(email.isNotBlank() && password.isNotBlank()) { "Enter your email and password." }
        val expectedUid=auth.signInWithEmailAndPassword(email.trim(),password).await().user?.uid
            ?: error("Sign-in did not return an account.")
        val account=mutations.verify(false)
        check(account.uid==expectedUid && configuration.currentUid==expectedUid) { "The signed-in account changed." }
        _session.value=SessionState(account,loading=false)
        refresh()
    }

    override suspend fun configureFirebase(value: String)=withContext(Dispatchers.IO) {
        val wasConfigured=configuration.configured
        configuration.configure(value)
        _session.value=SessionState(loading=false)
        if(!wasConfigured) installAuthListener()
        if(foreground) setForeground(true)
    }

    override suspend fun importLegacyReceipts(entries: Map<String,String>)=withContext(Dispatchers.IO) {
        val uid=owner()
        val prefix="mcl-pending-$uid-"
        for((key,raw) in entries) {
            if(!key.startsWith(prefix)) continue
            val clientId=key.removePrefix(prefix)
            if(clientId.isBlank()) continue
            val fingerprint=MessageDigest.getInstance("SHA-256").digest((key+"|"+raw).toByteArray())
                .joinToString("") { "%02x".format(it) }
            if(dao.record(uid,"legacyReceipts",fingerprint)!=null) continue
            val attempt=runCatching {
                val value=json.parseToJsonElement(raw).jsonObject
                val version=value["version"]
                require(version==null || version.jsonPrimitive.intOrNull==1)
                val id=value.getValue("id").jsonPrimitive.also { require(it.isString) }.content
                require(id.isNotBlank() && '/' !in id)
                val input=value.getValue("input").jsonObject
                fun string(name: String): String=input.getValue(name).jsonPrimitive.also { require(it.isString) }.content
                require(string("clientId")==clientId && string("collectorId")==uid)
                val amount=input.getValue("amount").jsonPrimitive.also { require(!it.isString) }.double
                require(LoanMath.cents(amount)>0)
                val date=string("paymentDate")
                require(LoanMath.validDate(date))
                val loanId=input["loanId"]?.jsonPrimitive?.also { require(it.isString) }?.content?.ifBlank { "initial" } ?: "initial"
                val notes=input["notes"]?.jsonPrimitive?.also { require(it.isString) }?.content ?: ""
                require(notes.length<=1500)
                ReceiptAttempt(id,Payment(id,clientId,loanId,amount,date,uid,string("collectorName"),notes),uid)
            }.getOrNull()
            database.withTransaction {
                if(attempt!=null) {
                    val existing=dao.pendingById(uid,attempt.id)
                    if(existing==null) dao.reserve(PendingReceiptEntity(uid,attempt.id,clientId,json.encodeToString(attempt),System.currentTimeMillis()))
                    else if(existing.payload!=json.encodeToString(attempt)) dao.reserve(PendingReceiptEntity(uid,
                        "legacy-conflict-$fingerprint",clientId,raw,System.currentTimeMillis()))
                } else dao.reserve(PendingReceiptEntity(uid,"legacy-malformed-$fingerprint",clientId,raw,System.currentTimeMillis()))
                dao.put(listOf(CacheRecord(uid,"legacyReceipts",fingerprint,"{}",details=key)))
            }
        }
    }

    override fun signOut() {
        profileGeneration++
        profileListener?.remove();profileListener=null
        if(configuration.configured) auth.signOut()
        _session.value=SessionState(loading=false)
        _sync.value=SyncState()
    }

    override suspend fun refresh(): Unit = withContext(Dispatchers.IO) {
        writes.withLock {
            if(!configuration.configured || auth.currentUser==null) return@withLock
            val expectedUid=auth.currentUser!!.uid
            val stagePrefix="__mcl_stage__:$expectedUid:"
            val staging=stagePrefix+UUID.randomUUID().toString()
            val old=_sync.value
            _sync.value=old.copy(loading=true,fresh=false,error=null,progress="Verifying access")
            try {
                val account=mutations.verify(false)
                val owner=account.uid
                check(owner==expectedUid && configuration.currentUid==expectedUid) { "The signed-in account changed." }
                _session.value=SessionState(account,loading=false)
                dao.put(listOf(CacheRecord(owner,"session",owner,json.encodeToString(account))))
                val cleanupError=if(account.isAdmin && foreground) runCatching { trash.purgeExpired() }.exceptionOrNull() else null
                dao.discardAbandonedStaging(stagePrefix)
                val generation=System.currentTimeMillis()
                suspend fun scan(kind: String,query: Query) {
                    _sync.update { it.copy(progress="Syncing $kind") }
                    source.scan(query) { documents ->
                        check(auth.currentUser?.uid==owner) { "The signed-in account changed." }
                        dao.put(documents.map { mapper.record(staging,kind,it,generation) })
                    }
                    dao.removeUnseen(staging,kind,generation)
                }
                scan("clients",db.collection("clients"))
                scan("payments",db.collection("payments"))
                scan("holidays",db.collection("holidays"))
                if(account.isAdmin) {
                    scan("accounts",db.collection("users").whereIn("role",listOf("admin","collector")))
                    scan("trash",db.collection("clientTrash"))
                }
                for((_,path) in settingsMapper.paths) {
                    if(!account.isAdmin && !path.endsWith("paymentPolicy")) continue
                    val document=db.document(path).get(Source.SERVER).await()
                    if(document.exists()) {
                        val encoded=FirestoreCodec.encode(document.data!!)
                        dao.put(listOf(CacheRecord(staging,"settings",path,encoded,raw=encoded,generation=generation)))
                    } else dao.remove(staging,"settings",path)
                }
                queries.settings(staging)
                _sync.update { it.copy(progress="Updating cached balances") }
                queries.rebuildLoans(staging)
                check(auth.currentUser?.uid==owner) { "The signed-in account changed." }
                val completedAt=System.currentTimeMillis()
                database.withTransaction {
                    check(configuration.currentUid==owner) { "The signed-in account changed." }
                    dao.clearSyncedSnapshot(owner)
                    dao.promoteSyncedSnapshot(staging,owner)
                    dao.put(listOf(CacheRecord(owner,"syncComplete","complete","{}",createdAt=completedAt)))
                }
                _sync.value=SyncState(complete=true,fresh=cleanupError==null,lastSyncedAt=completedAt,
                    error=cleanupError?.let { "Trash cleanup: ${it.message}" })
            } catch(error: CancellationException) {
                _sync.update { it.copy(loading=false,fresh=false,progress="") };throw error
            } catch(error: Exception) {
                if(configuration.currentUid==expectedUid) {
                    _sync.value=old.copy(loading=false,fresh=false,error=error.localizedMessage ?: "Synchronization failed.",progress="")
                    if(_session.value.account==null) _session.value=SessionState(loading=false,error=error.message)
                }
                throw error
            } finally {
                withContext(NonCancellable) { dao.discardStagedSnapshot(staging) }
            }
        }
    }

    private fun owner(): String {
        val account=session.value.account ?: error("Sign in first.")
        check(account.active && configuration.currentUid==account.uid) { "Verify the signed-in account before continuing." }
        return account.uid
    }

    private fun <T> cached(empty: T, read: suspend (String)->T): Flow<T> =
        session.map { it.account?.uid }.distinctUntilChanged().flatMapLatest { uid ->
            if(uid==null) flowOf(empty) else combine(dao.changes(uid),syncState) { _,_->read(uid) }
        }.flowOn(Dispatchers.IO)

    private fun <T> watched(kinds: Set<String>, upstream: Flow<T>): Flow<T> =
        session.map { state -> state.account?.let { Triple(it.uid,it.role,it.active) } }
            .distinctUntilChanged().flatMapLatest {
        channelFlow {
        val registrations=mutableListOf<ListenerRegistration>()
        val account=session.value.account
        if(configuration.configured && account!=null) {
            kinds.forEach { kind ->
                if(kind=="settings") {
                    settingsMapper.paths.values.filter { account.isAdmin || it.endsWith("paymentPolicy") }.forEach { path ->
                        var baseline=false
                        registrations+=db.document(path).addSnapshotListener(MetadataChanges.INCLUDE) { snapshot,error ->
                            if(configuration.currentUid!=account.uid) return@addSnapshotListener
                            if(error!=null) markStale(error.localizedMessage)
                            else if(snapshot!=null && !snapshot.metadata.isFromCache && !snapshot.metadata.hasPendingWrites()) {
                                if(baseline && foreground) scope.launch {
                                    delay(250)
                                    if(!_sync.value.loading && configuration.currentUid==account.uid) runCatching { refresh() }
                                }
                                baseline=true
                            }
                        }
                    }
                    return@forEach
                }
                val query: Query?=when(kind) {
                    "clients" -> db.collection("clients").orderBy("updatedAt",Query.Direction.DESCENDING).limit(100)
                    "payments" -> db.collection("payments").orderBy("createdAt",Query.Direction.DESCENDING).limit(100)
                    "holidays" -> db.collection("holidays").limit(100)
                    "accounts" -> if(account.isAdmin) db.collection("users").whereIn("role",listOf("admin","collector")).limit(100) else null
                    "trash" -> if(account.isAdmin) db.collection("clientTrash").orderBy("deletedAt",Query.Direction.DESCENDING).limit(100) else null
                    else -> null
                }
                var serverBaseline=false
                query?.let { source ->
                    registrations+=source.addSnapshotListener(MetadataChanges.INCLUDE) { snapshot,error ->
                        if(configuration.currentUid!=account.uid) return@addSnapshotListener
                        if(error!=null) markStale(error.localizedMessage)
                        else if(snapshot!=null && !snapshot.metadata.isFromCache && !snapshot.metadata.hasPendingWrites()) {
                            if(serverBaseline && snapshot.documentChanges.isNotEmpty() && foreground) {
                                scope.launch {
                                    delay(250)
                                    if(!_sync.value.loading && configuration.currentUid==account.uid) runCatching { refresh() }
                                }
                            }
                            serverBaseline=true
                        }
                    }
                }
            }
        }
        val forwarding=launch { upstream.collect { send(it) } }
        awaitClose { registrations.forEach(ListenerRegistration::remove);forwarding.cancel() }
        }
    }.flowOn(Dispatchers.IO)

    override fun observeClients(query: ListQuery)=watched(setOf("clients","payments","holidays"),cached(Page<Client>()) { queries.page<Client>(it,"clients",query,_sync.value.fresh) })
    override suspend fun clientsPage(query: ListQuery)=withContext(Dispatchers.IO) { queries.page<Client>(owner(),"clients",query,_sync.value.fresh) }
    override fun observeClient(id: String)=watched(setOf("clients","payments","holidays"),cached<Client?>(null) { dao.record(it,"clients",id)?.let { row->json.decodeFromString<Client>(row.payload) } })
    override suspend fun getClient(id: String): Client? = withContext(Dispatchers.IO) {
        mutations.verify(false)
        if(!db.document("clients/$id").get(Source.SERVER).await().exists()) null else mutations.currentLoan(id)
    }
    override fun observePayments(clientId: String?,loanId: String?,date: String?,page: Int,pageSize: Int)=
        watched(setOf("payments","clients"),cached(Page<Payment>()) { queries.paymentPage(it,clientId,loanId,date,page,pageSize,_sync.value.fresh) })
    override suspend fun paymentsPage(clientId: String?,loanId: String?,date: String?,page: Int,pageSize: Int)=
        withContext(Dispatchers.IO) { queries.paymentPage(owner(),clientId,loanId,date,page,pageSize,_sync.value.fresh) }

    override fun observePendingReceipts(clientId: String?): Flow<List<ReceiptAttempt>> =
        session.map { it.account?.uid }.distinctUntilChanged().flatMapLatest { uid ->
            if(uid==null) flowOf(emptyList()) else dao.pending(uid,clientId).map { rows ->
                rows.map { row -> runCatching { json.decodeFromString<ReceiptAttempt>(row.payload) }
                    .getOrElse { ReceiptAttempt(row.id,Payment(id=row.id,clientId=row.clientId),uid,
                        "This reserved receipt could not be restored. Its saved payload has been retained. Ask an administrator to reconcile it.") } }
            }
        }.flowOn(Dispatchers.IO)

    override fun observeRenewals(clientId: String,page: Int,pageSize: Int): Flow<Page<RenewalRecord>> =
        cached(Page<RenewalRecord>()) { queries.page<RenewalRecord>(it,"renewals:$clientId",ListQuery(page=page,pageSize=pageSize),_sync.value.fresh) }
            .onStart {
                try {
                    refreshRenewals(clientId)
                } catch(error: CancellationException) {
                    throw error
                } catch(error: Exception) {
                    markStale("Renewal history could not be refreshed. Cached history remains available. ${error.localizedMessage.orEmpty()}")
                }
            }
    override suspend fun renewalsPage(clientId: String,page: Int,pageSize: Int): Page<RenewalRecord> =
        withContext(Dispatchers.IO) {
            if(dao.record(owner(),"renewalSync",clientId)==null) refreshRenewals(clientId)
            queries.page(owner(),"renewals:$clientId",ListQuery(page=page,pageSize=pageSize),_sync.value.fresh)
        }

    private suspend fun refreshRenewals(clientId: String)=withContext(Dispatchers.IO) {
        writes.withLock {
            val account=mutations.verify()
            val generation=System.currentTimeMillis()
            val staging="__mcl_stage__:${account.uid}:renewals-${UUID.randomUUID()}"
            val kind="renewals:$clientId"
            try {
                source.scan(db.document("clients/$clientId").collection("renewals")) { docs ->
                    check(configuration.currentUid==account.uid) { "The signed-in account changed." }
                    dao.put(docs.map { mapper.record(staging,kind,it,generation) })
                }
                database.withTransaction {
                    check(configuration.currentUid==account.uid) { "The signed-in account changed." }
                    dao.clearKind(account.uid,kind)
                    dao.promoteKind(staging,account.uid,kind)
                    dao.put(listOf(CacheRecord(account.uid,"renewalSync",clientId,"{}",generation=generation)))
                }
            } finally {
                withContext(NonCancellable) { dao.discardStagedSnapshot(staging) }
            }
        }
    }

    override fun observeAccounts(query: ListQuery)=watched(setOf("accounts"),cached(Page<UserAccount>()) { queries.page<UserAccount>(it,"accounts",query,_sync.value.fresh) })
    override fun observeHolidays(query: ListQuery)=watched(setOf("holidays"),cached(Page<Holiday>()) { queries.page<Holiday>(it,"holidays",query,_sync.value.fresh) })
    override fun observeTrash(query: ListQuery)=watched(setOf("trash"),cached(Page<TrashedClient>()) { queries.page<TrashedClient>(it,"trash",query,_sync.value.fresh) })
    override fun observeSettings()=watched(setOf("settings"),cached(AppSettings()) { queries.settings(it) })
    override fun observeDashboard(date: String)=watched(setOf("clients","payments","accounts","holidays"),cached(DashboardStats()) { queries.dashboard(it,date) })
    override fun observeDailySummary(date: String,query: ListQuery)=watched(setOf("clients","payments"),cached(Page<DailySummaryRow>()) { queries.summary(it,date,query,_sync.value.fresh) })
    override fun observeCollectionDays(clientId: String,page: Int,pageSize: Int)=cached(Page<CollectionDay>()) {
        queries.collectionDays(it,clientId,page,pageSize,_sync.value.fresh)
    }
    override suspend fun collectionDaysPage(clientId: String,page: Int,pageSize: Int)=withContext(Dispatchers.IO) {
        queries.collectionDays(owner(),clientId,page,pageSize,_sync.value.fresh)
    }
    override fun observeConsolidation(query: ListQuery)=watched(setOf("clients","payments"),cached(Page<ConsolidationRow>()) { queries.consolidation(it,query,_sync.value.fresh) })
    override suspend fun dailySummaryPage(date: String,query: ListQuery)=withContext(Dispatchers.IO) { queries.summary(owner(),date,query,_sync.value.fresh) }
    override suspend fun consolidationPage(query: ListQuery)=withContext(Dispatchers.IO) { queries.consolidation(owner(),query,_sync.value.fresh) }
    override suspend fun matchingIds(kind: String,query: ListQuery)=withContext(Dispatchers.IO) {
        require(kind in listOf("clients","trash","accounts","holidays"))
        queries.ids(owner(),kind,query)
    }

    private suspend fun mutate(block: suspend ()->Unit): Unit =withContext(Dispatchers.IO) {
        writes.withLock {
            check(_sync.value.canWrite) { "Refresh and wait for a complete server-confirmed synchronization before making changes." }
            block()
        }
        // A committed write must not be reported as failed just because the subsequent cache refresh failed.
        runCatching { refresh() }
    }

    override suspend fun saveClient(input: Client,expected: Client?)=mutate { mutations.saveClient(input,expected) }
    override suspend fun reservePayment(client: Client,amount: Double,date: String,notes: String): ReceiptAttempt =
        withContext(Dispatchers.IO) { writes.withLock {
            val uid=owner()
            dao.pendingForClient(uid,client.id)?.let { row -> return@withLock json.decodeFromString<ReceiptAttempt>(row.payload) }
            check(_sync.value.canWrite) { "Refresh before recording a receipt." }
            val actor=mutations.verify(false)
            val actual=mutations.currentLoan(client.id)
            check(actual.activeLoanId==client.activeLoanId) { "This loan changed. Reopen Payments." }
            require(notes.length<=500) { "Notes must be at most 500 characters." }
            val settings=queries.settings(uid)
            LoanMath.validatePayment(amount,date,actual,settings.payments.enforceDailyMinimum,actor.role)
            val id=db.collection("payments").document().id
            val payment=Payment(id,client.id,client.activeLoanId,amount,date,actor.uid,actor.fullName,
                notes.trim().ifBlank { settings.general.defaultPaymentNote })
            ReceiptAttempt(id,payment,uid).also {
                dao.reserve(PendingReceiptEntity(uid,id,client.id,json.encodeToString(it),System.currentTimeMillis()))
            }
        } }

    override suspend fun submitPayment(attempt: ReceiptAttempt): Unit =withContext(Dispatchers.IO) {
        writes.withLock {
            val stored=dao.pendingById(attempt.ownerUid,attempt.id) ?: error("The receipt is not reserved on this device.")
            check(json.decodeFromString<ReceiptAttempt>(stored.payload)==attempt) { "Reserved receipt details changed. Reconcile before continuing." }
            // Retries keep the original ID, payload and loan cycle, including after a later renewal.
            mutations.submit(attempt)
            dao.confirm(attempt.ownerUid,attempt.id)
        }
        runCatching { refresh() }
    }
    override suspend fun deletePayment(expected: Payment)=mutate { mutations.deletePayment(expected) }
    override suspend fun renewalEligibility(clientId: String): RenewalEligibility=withContext(Dispatchers.IO) {
        writes.withLock {
            check(_sync.value.canWrite) { "Wait for server-confirmed data before checking renewal." }
            mutations.assess(clientId)
        }
    }
    override suspend fun renewClient(client: Client,terms: RenewalTerms,notes: String)=mutate { mutations.renew(client,terms,notes) }
    override suspend fun trashClients(ids: List<String>)=mutate { trash.apply("trash",ids) }
    override suspend fun restoreClients(ids: List<String>)=mutate { trash.apply("restore",ids) }
    override suspend fun purgeClients(ids: List<String>)=mutate { trash.apply("purge",ids) }
    override suspend fun addAccount(input: AccountInput)=mutate { mutations.addAccount(input) }
    override suspend fun saveAccount(account: UserAccount)=mutate { mutations.saveAccount(account) }
    override suspend fun setAccountActive(id: String,active: Boolean)=mutate { mutations.setActive(id,active) }
    override suspend fun deleteAccount(id: String)=mutate { mutations.deleteAccount(id) }
    override suspend fun resetPassword(email: String)=mutate { mutations.resetPassword(email) }
    override suspend fun saveHoliday(holiday: Holiday)=mutate { mutations.saveHoliday(holiday) }
    override suspend fun deleteHoliday(date: String)=mutate { mutations.deleteHoliday(date) }
    override suspend fun saveSettings(settings: AppSettings,expectedRevision: String)=mutate { mutations.saveSettings(settings,expectedRevision) }
    override suspend fun initializeSettings()=mutate { mutations.initializeSettings() }
    override suspend fun completeClientRecords()=mutate {
        var page=0
        do {
            val batch=queries.recordPage(owner(),"clients",ListQuery(page=page,pageSize=100),true)
            batch.items.filter { it.parentId=="incomplete" }.forEach { mutations.allocate(null,it.id) }
            if(!batch.hasMore) break
            page++
        } while(true)
    }
}
