package com.mcl.mcllendingapp.data.repository

import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import com.mcl.mcllendingapp.data.local.CacheDao
import com.mcl.mcllendingapp.data.mapper.FirestoreCodec
import com.mcl.mcllendingapp.data.mapper.RecordMapper
import com.mcl.mcllendingapp.data.mapper.SettingsMapper
import com.mcl.mcllendingapp.data.remote.FirestoreSource
import com.mcl.mcllendingapp.domain.model.*
import kotlinx.coroutines.tasks.await
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject

class FirestoreMutations @Inject constructor(
    private val configuration: com.mcl.mcllendingapp.data.remote.FirebaseConfiguration,
    private val mapper: RecordMapper, private val settingsMapper: SettingsMapper,
    private val source: FirestoreSource, private val dao: CacheDao,
) {
    private val auth get()=configuration.auth
    private val db get()=configuration.db
    private val stamp get() = FieldValue.serverTimestamp()

    fun actor(transaction: Transaction, admin: Boolean = true): UserAccount {
        val uid = auth.currentUser?.uid ?: error("Sign in before making changes.")
        val profile = transaction.get(db.collection("users").document(uid))
        val account = mapper.account(uid, profile.data ?: error("No account profile."))
        check(account.active && (!admin || account.isAdmin)) { "An active administrator account is required." }
        return account
    }

    suspend fun verify(admin: Boolean = true): UserAccount {
        val uid = auth.currentUser?.uid ?: error("Sign in before making changes.")
        val profile = db.document("users/$uid").get(Source.SERVER).await()
        val account = mapper.account(uid,profile.data ?: error("No account profile."))
        check(account.active && (!admin || account.isAdmin)) { "An active administrator account is required." }
        return account
    }

    private fun clientFields(c: Client): Map<String, Any?> = mapOf(
        "firstName" to c.firstName,"middleName" to c.middleName,"lastName" to c.lastName,
        "address" to c.address,"cellphone" to c.cellphone,"principal" to c.principal,
        "interest" to c.interest,"dailyAmount" to c.dailyAmount,"loanTermDays" to c.loanTermDays,
        "approvalDate" to c.approvalDate)

    private fun loanSnapshot(c: Client): Map<String,Any?> = clientFields(c) + mapOf(
        "id" to c.id,"clientNumber" to c.publicId,"transactionNumber" to c.transactionNumber,
        "activeLoanId" to c.activeLoanId,"renewalCount" to c.renewalCount,
        "originalTransactionNumber" to c.originalTransactionNumber.ifBlank { c.transactionNumber })

    private fun sameClient(actual: Client, expected: Client): Boolean =
        actual.revision==expected.revision && actual.activeLoanId==expected.activeLoanId &&
        actual.transactionNumber==expected.transactionNumber && actual.renewalCount==expected.renewalCount &&
        clientFields(actual)==clientFields(expected)

    suspend fun saveClient(input: Client, expected: Client?) {
        val value=LoanMath.validateClient(input)
        if(expected==null) allocate(value,null) else db.runTransaction { tx ->
            actor(tx)
            val ref=db.document("clients/${expected.id}")
            val snapshot=tx.get(ref)
            val raw=snapshot.data ?: error("This client no longer exists.")
            val current=mapper.client(expected.id,raw)
            check(sameClient(current,expected)) { "This client changed in another session. Reopen Edit." }
            val fields=clientFields(value)
            tx.update(ref,fields+("updatedAt" to stamp))
        }.await()
    }

    suspend fun allocate(input: Client?, existingId: String?) {
        require((input==null)!=(existingId==null)) { "Choose a new client or an existing client to complete." }
        db.runTransaction { tx ->
            actor(tx)
            val existingRef=existingId?.let { db.document("clients/$it") }
            val existing=existingRef?.let(tx::get)
            if(existingRef!=null && existing?.exists()!=true) return@runTransaction
            val old=existing?.data
            if(old?.get("clientNumber") is String && (old["clientNumber"] as String).isNotBlank() &&
                old["transactionNumber"] is String && (old["transactionNumber"] as String).isNotBlank() &&
                ((old["dailyAmount"] as? Number)?.toDouble() ?: 0.0)>0) return@runTransaction
            val existingClient=if(existingRef!=null && old!=null) mapper.client(existingRef.id,old) else null
            val config=tx.get(db.document("settings/Configurations/elements/general"))
            val general=settingsMapper.read(mapOf("general" to FirestoreCodec.encode(config.data ?: emptyMap()))).general
            val countersRef=db.document("settings/Configurations/elements/counters")
            val counters=tx.get(countersRef)
            var clientSequence=(counters.get("clientSequence") as? Number)?.toLong() ?: 0L
            var transactionSequence=(counters.get("transactionSequence") as? Number)?.toLong() ?: 0L
            var clientNumber=(old?.get("clientNumber") as? String).orEmpty()
            var transactionNumber=(old?.get("transactionNumber") as? String).orEmpty()
            repeat(100) {
                if(clientNumber.isBlank()) {
                    val candidate=general.clientIdPrefix+(++clientSequence).toString().padStart(general.clientIdDigits,'0')
                    val reservation=tx.get(db.document("settings/Identifiers/clients/$candidate"))
                    val occupied=tx.get(db.document("clients/$candidate"))
                    if(!reservation.exists() && (!occupied.exists() || candidate==existingId)) clientNumber=candidate
                }
            }
            repeat(100) {
                if(transactionNumber.isBlank()) {
                    val candidate=(++transactionSequence).toString().padStart(5,'0')
                    val reservation=tx.get(db.document("settings/Identifiers/transactions/$candidate"))
                    if(!reservation.exists()) transactionNumber=candidate
                }
            }
            check(clientNumber.isNotBlank() && Regex("^\\d{5}$").matches(transactionNumber)) { "Check identifier allocation counters." }
            val ref=existingRef ?: db.document("clients/$clientNumber")
            val clientReservation=db.document("settings/Identifiers/clients/$clientNumber")
            val transactionReservation=db.document("settings/Identifiers/transactions/$transactionNumber")
            val reservedClient=tx.get(clientReservation)
            val reservedTransaction=tx.get(transactionReservation)
            check(!reservedClient.exists() || reservedClient.getString("clientId")==ref.id) { "Client number already belongs to another client." }
            check(!reservedTransaction.exists() || reservedTransaction.getString("clientId")==ref.id) { "Transaction already belongs to another client." }
            val completion=existingClient?.let { mapOf<String,Any?>("clientNumber" to clientNumber,
                "transactionNumber" to transactionNumber,"dailyAmount" to LoanMath.dailyPayable(it)) }
            tx.set(countersRef,mapOf("clientSequence" to clientSequence,"transactionSequence" to transactionSequence,"updatedAt" to stamp))
            tx.set(clientReservation,mapOf("clientId" to ref.id))
            tx.set(transactionReservation,mapOf("clientId" to ref.id))
            if(existingRef!=null && completion!=null) {
                tx.update(existingRef,completion+("updatedAt" to stamp))
            } else if(input!=null) {
                tx.set(ref,clientFields(input)+mapOf("clientNumber" to clientNumber,
                    "transactionNumber" to transactionNumber,
                    "createdAt" to stamp,"updatedAt" to stamp))
            }
        }.await()
    }

    suspend fun currentLoan(id: String): Client {
        val document=db.document("clients/$id").get(Source.SERVER).await()
        val client=mapper.client(id,document.data ?: error("This client no longer exists."))
        var total=0L
        var latest: String?=null
        source.scan(db.collection("payments").whereEqualTo("clientId",id)) { batch ->
            batch.forEach { doc ->
                val p=mapper.payment(doc.id,doc.data ?: emptyMap())
                if(p.loanId==client.activeLoanId) {
                    require(p.paymentDate>=client.approvalDate && p.paymentDate<=LoanMath.today()) { "Correct invalid or future-dated receipts before making financial changes." }
                    total=Math.addExact(total,LoanMath.cents(p.amount))
                    if(latest==null || p.paymentDate>latest!!) latest=p.paymentDate
                }
            }
        }
        return LoanMath.summarize(client,total,latest,holidays(client.approvalDate))
    }

    private suspend fun holidays(from: String): Set<String> {
        val result=mutableSetOf<String>()
        source.scan(db.collection("holidays")) { batch ->
            batch.forEach { doc ->
                val date=doc.getString("date") ?: doc.id
                if(date>=from && date<=LocalDate.parse(from).plusDays(3660).toString()) result+=date
            }
        }
        return result
    }

    fun paymentFields(p: Payment): Map<String,Any?> = mapOf(
        "clientId" to p.clientId,"loanId" to p.loanId,"amount" to p.amount,"paymentDate" to p.paymentDate,
        "collectorId" to p.collectorId,"collectorName" to p.collectorName,"notes" to p.notes)

    suspend fun submit(attempt: ReceiptAttempt) {
        check(attempt.error==null && attempt.ownerUid==auth.currentUser?.uid && attempt.id==attempt.payment.id) {
            "This reserved receipt needs administrator reconciliation." }
        require(attempt.id.isNotBlank() && attempt.id.toByteArray(Charsets.UTF_8).size<=1500 &&
            attempt.id !in setOf(".", "..") && '/' !in attempt.id && attempt.payment.notes.length<=1500) { "Invalid reserved receipt details. Ask an administrator to reconcile it." }
        val alreadyRecorded=db.runTransaction { tx ->
            actor(tx,false)
            val committed=tx.get(db.document("payments/${attempt.id}"))
            val removed=tx.get(db.document("receiptDeletions/${attempt.id}"))
            acknowledge(attempt,committed,removed)
        }.await()
        if(alreadyRecorded) return
        val reviewed=currentLoan(attempt.payment.clientId)
        db.runTransaction { tx ->
            val actor=actor(tx,false)
            check(actor.uid==attempt.ownerUid) { "The receipt belongs to another account." }
            val ref=db.document("payments/${attempt.id}")
            val old=tx.get(ref)
            val deletion=tx.get(db.document("receiptDeletions/${attempt.id}"))
            if(acknowledge(attempt,old,deletion)) return@runTransaction
            val clientId=attempt.payment.clientId
            val clientDoc=tx.get(db.document("clients/$clientId"))
            val client=mapper.client(clientId,clientDoc.data ?: error("Client no longer exists."))
            check(client.activeLoanId==attempt.payment.loanId) {
                "This loan changed. Keep this reserved receipt and ask an administrator to reconcile it." }
            check(sameClient(client,reviewed)) { "The loan changed. Refresh Payments before retrying." }
            val policy=tx.get(db.document("settings/Configurations/elements/paymentPolicy"))
            LoanMath.validatePayment(attempt.payment.amount,attempt.payment.paymentDate,reviewed,
                policy.getBoolean("enforceDailyMinimum")==true,actor.role)
            check(attempt.payment.collectorId==actor.uid && attempt.payment.collectorName==actor.fullName) { "Receipt actor details changed. Reconcile this reserved receipt." }
            tx.set(ref,paymentFields(attempt.payment)+("createdAt" to stamp))
        }.await()
    }

    private fun acknowledge(attempt: ReceiptAttempt, old: DocumentSnapshot, deletion: DocumentSnapshot): Boolean {
        check(!old.exists() || !deletion.exists()) { "This receipt also has a deletion record. Reconcile it." }
        if(!old.exists() && !deletion.exists()) return false
        @Suppress("UNCHECKED_CAST")
        val raw=if(old.exists()) old.data else deletion.get("payment") as? Map<String,Any?>
        val original=mapper.payment(attempt.id,raw ?: error("Incomplete deletion record."))
        check(paymentFields(original)==paymentFields(attempt.payment)) {
            "This receipt identifier has different details. Reconcile it before recording another payment." }
        return true
    }

    suspend fun deletePayment(expected: Payment) {
        db.runTransaction { tx ->
            val actor=actor(tx)
            val ref=db.document("payments/${expected.id}")
            val deletionRef=db.document("receiptDeletions/${expected.id}")
            val deletion=tx.get(deletionRef)
            val snapshot=tx.get(ref)
            if(!snapshot.exists()) {
                check(deletion.exists()) { "This receipt no longer exists." }
                @Suppress("UNCHECKED_CAST")
                val deleted=mapper.payment(expected.id,deletion.get("payment") as? Map<String,Any?>
                    ?: error("Incomplete deletion record."))
                check(paymentFields(deleted)==paymentFields(expected) && deleted.createdAt==expected.createdAt) {
                    "This receipt identifier has different deleted details. Reconcile it." }
                return@runTransaction
            }
            check(!deletion.exists()) { "This receipt also has a deletion record. Reconcile it." }
            val current=mapper.payment(expected.id,snapshot.data!!)
            val client=mapper.client(current.clientId,
                tx.get(db.document("clients/${current.clientId}")).data ?: error("Client no longer exists."))
            check(client.activeLoanId==current.loanId) { "This loan changed. Reopen Payments." }
            check(paymentFields(current)==paymentFields(expected) && current.createdAt==expected.createdAt) { "This receipt changed. Reopen Payments." }
            tx.set(deletionRef,mapOf("clientId" to current.clientId,"payment" to snapshot.data,
                "deletedBy" to actor.uid,"deletedAt" to stamp))
            tx.delete(ref)
        }.await()
    }

    suspend fun assess(clientId: String): RenewalEligibility {
        verify()
        val current=currentLoan(clientId)
        if(current.outstanding>0 || current.principal+current.interest<=0) return RenewalEligibility(false,
            "The current loan must be fully paid.",dueDate=current.dueDate,totalPaid=current.totalPaid)
        val paidOn=payoffDate(current)
        if(paidOn>current.dueDate) return RenewalEligibility(false,"This loan was settled after its due date.",
            paidOn,current.dueDate,current.totalPaid)
        var count=0
        var invalid=false
        source.scan(db.document("clients/$clientId").collection("renewals")) { batch ->
            batch.forEach { doc ->
                val history=mapper.renewal(doc.id,doc.data!!)
                count++
                if(!LoanMath.validDate(history.paidOn) || !LoanMath.validDate(history.dueDate) || history.paidOn>history.dueDate) invalid=true
            }
        }
        if(count!=current.renewalCount || invalid) return RenewalEligibility(false,
            "Previous renewal history must be complete and settled on time.",paidOn,current.dueDate,current.totalPaid)
        return RenewalEligibility(true,"Fully paid on or before the due date. Administrator approval is required.",
            paidOn,current.dueDate,current.totalPaid)
    }

    suspend fun renew(client: Client, terms: RenewalTerms, notes: String) {
        require(notes.length<=1500) { "Notes must be at most 1,500 characters." }
        verify()
        val current=currentLoan(client.id)
        check(sameClient(current,client)) { "The loan changed. Reopen renewal." }
        check(current.outstanding==0.0 && current.principal+current.interest>0) { "The current loan must be fully paid." }
        val paidOn=payoffDate(current)
        require(paidOn<=current.dueDate) { "This loan was settled after its due date." }
        LoanMath.validateRenewal(terms,paidOn)
        var historyCount=0
        var historyInvalid=false
        source.scan(db.collection("clients").document(client.id).collection("renewals")) { batch ->
            batch.forEach { doc ->
                val history=mapper.renewal(doc.id,doc.data!!)
                historyCount++
                if(!LoanMath.validDate(history.paidOn) || history.paidOn>history.dueDate) historyInvalid=true
            }
        }
        check(historyCount==current.renewalCount && !historyInvalid) {
            "Renewal history must be complete and settled on time." }
        val newHolidays=holidays(terms.approvalDate)
        db.runTransaction { tx ->
            val actor=actor(tx)
            val ref=db.document("clients/${client.id}")
            val actual=mapper.client(client.id,tx.get(ref).data ?: error("Client no longer exists."))
            check(sameClient(actual,current)) { "The loan changed. Reopen renewal." }
            val counterRef=db.document("settings/Configurations/elements/counters")
            val counters=tx.get(counterRef)
            var sequence=(counters.get("transactionSequence") as? Number)?.toLong() ?: 0L
            var transaction=""
            repeat(100) {
                if(transaction.isEmpty()) {
                    val candidate=(++sequence).toString().padStart(5,'0')
                    val reservation=tx.get(db.document("settings/Identifiers/transactions/$candidate"))
                    val previous=tx.get(ref.collection("renewals").document(candidate))
                    if(!reservation.exists() && !previous.exists()) transaction=candidate
                }
            }
            check(Regex("^\\d{5}$").matches(transaction)) { "Check the transaction allocation counter." }
            val next=current.copy(principal=terms.principal,interest=terms.interest,dailyAmount=terms.dailyAmount,
                loanTermDays=terms.loanTermDays,approvalDate=terms.approvalDate,transactionNumber=transaction,
                activeLoanId=transaction,renewalCount=current.renewalCount+1)
            tx.set(ref.collection("renewals").document(transaction),mapOf(
                "sequence" to next.renewalCount,"previousLoan" to loanSnapshot(current),"newLoan" to loanSnapshot(next),
                "totalPaid" to current.totalPaid,"paidOn" to paidOn,"dueDate" to current.dueDate,
                "newDueDate" to LoanMath.schedule(terms.approvalDate,terms.loanTermDays,newHolidays).dueDate,
                "approvedBy" to actor.uid,"approvedByName" to actor.fullName,"notes" to notes.trim(),"createdAt" to stamp))
            tx.update(ref,clientFields(next)+mapOf("transactionNumber" to transaction,"activeLoanId" to transaction,
                "renewalCount" to next.renewalCount,"originalTransactionNumber" to current.originalTransactionNumber.ifBlank { current.transactionNumber },"updatedAt" to stamp))
            tx.set(counterRef,mapOf("transactionSequence" to sequence,"updatedAt" to stamp),SetOptions.merge())
            tx.set(db.document("settings/Identifiers/transactions/$transaction"),mapOf("clientId" to client.id,"loanId" to transaction))
        }.await()
    }

    private suspend fun payoffDate(client: Client): String {
        val staging="__mcl_stage__:${auth.currentUser!!.uid}:payoff-${UUID.randomUUID()}"
        val generation=System.currentTimeMillis()
        try {
            source.scan(db.collection("payments").whereEqualTo("clientId",client.id)) { batch ->
                dao.put(batch.map { mapper.record(staging,"payments",it,generation) })
            }
            var paid=0L
            var offset=0
            while(true) {
                val grouped=dao.groups(androidx.sqlite.db.SimpleSQLiteQuery(
                    "SELECT date AS label,SUM(amountCents) AS value FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? GROUP BY date ORDER BY date LIMIT 100 OFFSET ?",
                    arrayOf<Any?>(staging,client.id,client.activeLoanId,offset)))
                if(grouped.isEmpty()) break
                for(group in grouped) {
                    require(LoanMath.validDate(group.label) && group.label>=client.approvalDate && group.label<=LoanMath.today()) { "Correct invalid payment dates before renewing." }
                    paid=Math.addExact(paid,group.value)
                    if(paid>=LoanMath.cents(client.principal)+LoanMath.cents(client.interest)) return group.label
                }
                offset+=grouped.size
            }
            error("A complete payment history is required.")
        } finally {
            kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
                dao.discardStagedSnapshot(staging)
            }
        }
    }

    suspend fun addAccount(input: AccountInput) {
        verify()
        require(input.role in listOf("admin","collector") && input.fullName.isNotBlank()) { "Choose a managed role and enter a full name." }
        require(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(input.email.trim()) && input.password.length>=8) { "Enter a valid email and password of at least eight characters." }
        val phone=if(input.phone.isBlank()) "" else LoanMath.cellphone(input.phone)
        val default=FirebaseApp.getInstance()
        val app=FirebaseApp.getApps(default.applicationContext).find { it.name=="mcl-provisioning" }
            ?: FirebaseApp.initializeApp(default.applicationContext,default.options,"mcl-provisioning")
        val provision=FirebaseAuth.getInstance(app)
        try {
            val user=provision.createUserWithEmailAndPassword(input.email.trim().lowercase(),input.password).await().user!!
            try {
                db.document("users/${user.uid}").set(mapOf("role" to input.role,"fullName" to LoanMath.clean(input.fullName),
                    "email" to input.email.trim().lowercase(),"phone" to phone,"active" to true,"createdAt" to stamp)).await()
            } catch(error: Exception) { runCatching { user.delete().await() }; throw error }
        } finally { provision.signOut() }
    }

    suspend fun saveAccount(account: UserAccount) {
        db.runTransaction { tx ->
            val actor=actor(tx)
            val ref=db.document("users/${account.uid}")
            val existing=tx.get(ref)
            check(existing.getString("role") in listOf("admin","collector")) { "Developer profiles are managed outside the app." }
            require(account.fullName.isNotBlank()) { "Full name is required." }
            check(account.uid!=actor.uid || account.active) { "You cannot deactivate your own account." }
            val phone=if(account.phone.isBlank()) "" else LoanMath.cellphone(account.phone)
            tx.update(ref,mapOf("fullName" to LoanMath.clean(account.fullName),"phone" to phone,"active" to account.active))
        }.await()
    }

    suspend fun setActive(id: String, active: Boolean) {
        db.runTransaction { tx ->
            val actor=actor(tx)
            check(id!=actor.uid || active) { "You cannot deactivate your own account." }
            val ref=db.document("users/$id")
            check(tx.get(ref).getString("role") in listOf("admin","collector")) { "Developer profiles cannot be managed here." }
            tx.update(ref,"active",active)
        }.await()
    }

    suspend fun deleteAccount(id: String) {
        db.runTransaction { tx ->
            val actor=actor(tx)
            check(id!=actor.uid) { "You cannot delete your own account." }
            val ref=db.document("users/$id")
            check(tx.get(ref).getString("role") in listOf("admin","collector")) { "Developer profiles cannot be managed here." }
            tx.delete(ref)
        }.await()
    }

    suspend fun resetPassword(email: String) { verify(); auth.sendPasswordResetEmail(email).await() }

    suspend fun saveHoliday(holiday: Holiday) {
        require(LoanMath.validDate(holiday.date) && holiday.name.isNotBlank()) { "Choose a date and enter the holiday name." }
        db.runTransaction { tx -> actor(tx); tx.set(db.document("holidays/${holiday.date}"),
            mapOf("date" to holiday.date,"name" to LoanMath.clean(holiday.name))) }.await()
    }
    suspend fun deleteHoliday(date: String) {
        db.runTransaction { tx -> actor(tx); tx.delete(db.document("holidays/$date")) }.await()
    }

    suspend fun saveSettings(value: AppSettings, expected: String) {
        val changes=settingsMapper.write(value)
        db.runTransaction { tx ->
            val actor=actor(tx)
            val documents=settingsMapper.paths.mapValues { (_,path)->tx.get(db.document(path)) }
            val raw=documents.mapValues { (_,snapshot)->FirestoreCodec.encode(snapshot.data ?: emptyMap()) }
            check(settingsMapper.read(raw).revision==expected) { "Settings changed in another session. Reload saved settings." }
            changes.forEach { (key,fields)->tx.set(db.document(settingsMapper.paths.getValue(key)),
                fields+mapOf("updatedAt" to stamp,"updatedBy" to actor.uid)) }
        }.await()
    }

    suspend fun initializeSettings() {
        val defaults=settingsMapper.write(AppSettings())
        db.runTransaction { tx ->
            val actor=actor(tx)
            val documents=settingsMapper.paths.mapValues { (_,path)->tx.get(db.document(path)) }
            documents.forEach { (key,snapshot)->if(!snapshot.exists()) tx.set(snapshot.reference,
                defaults.getValue(key)+mapOf("updatedAt" to stamp,"updatedBy" to actor.uid)) }
        }.await()
    }
}
