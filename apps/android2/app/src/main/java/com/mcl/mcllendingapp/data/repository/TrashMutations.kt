package com.mcl.mcllendingapp.data.repository

import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.*
import com.mcl.mcllendingapp.data.local.CacheDao
import com.mcl.mcllendingapp.data.local.CacheRecord
import com.mcl.mcllendingapp.data.remote.TrashRequest
import com.mcl.mcllendingapp.data.remote.TrashSelection
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject

class TrashMutations @Inject constructor(private val configuration: com.mcl.mcllendingapp.data.remote.FirebaseConfiguration,
    private val dao: CacheDao, private val mutations: FirestoreMutations, private val json: Json) {
    private val auth get()=configuration.auth
    private val db get()=configuration.db
    private val stamp get()=FieldValue.serverTimestamp()

    suspend fun apply(operation: String, ids: List<String>) {
        mutations.verify()
        require(operation in listOf("trash","restore","purge") && ids.isNotEmpty() && ids.distinct().size==ids.size)
        ids.forEach { require(validId(it)) { "Invalid client selection." } }
        val owner=auth.currentUser!!.uid
        val key=MessageDigest.getInstance("SHA-256").digest((operation+"|"+ids.sorted().joinToString("|")).toByteArray())
            .joinToString("") { "%02x".format(it) }
        val previous=dao.record(owner,"trashRequests",key)
        var request=previous?.let { json.decodeFromString<TrashRequest>(it.payload) } ?: run {
            val operationId=UUID.randomUUID().toString()
            val entries=ids.mapIndexed { index,id ->
                val trash=if(operation=="trash") null else db.document("clientTrash/$id").get(Source.SERVER).await()
                val trashId=trash?.getString("trashId")
                if(operation!="trash") check(!trashId.isNullOrBlank()) { "Trash changed. Refresh your selection." }
                TrashSelection(id,trashId,if(operation=="purge") "purge-$trashId" else "${operationId}_$index")
            }
            TrashRequest(operation,entries)
        }
        fun record(value: TrashRequest)=CacheRecord(owner,"trashRequests",key,json.encodeToString(value))
        dao.put(listOf(record(request)))
        while(request.completed<request.entries.size) {
            try {
                mutate(operation,request.entries[request.completed])
                request=request.copy(completed=request.completed+1)
                dao.put(listOf(record(request)))
            } catch(error: Exception) {
                throw IllegalStateException("${request.completed} of ${request.entries.size} clients completed. ${error.message} Retry to finish this selection.",error)
            }
        }
        dao.remove(owner,"trashRequests",key)
    }

    private fun validId(value: String)=value.isNotBlank() && value.toByteArray().size<=1500 &&
        '/' !in value && value!="." && value!=".."

    private suspend fun mutate(operation: String, entry: TrashSelection, automatic: Boolean = false) {
        val client=db.document("clients/${entry.id}")
        val archive=db.document("clientTrash/${entry.id}")
        val operationRef=db.document("clientTrashOperations/${entry.requestId}")
        val requestKey=buildJsonObject {
            put("operation",operation)
            putJsonArray("entries") { add(buildJsonObject {
                put("id",entry.id); put("trashId",entry.trashId?.let(::JsonPrimitive) ?: JsonNull)
            }) }
        }.toString()
        val complete=db.runTransaction { tx ->
            val actor=mutations.actor(tx)
            val attempt=tx.get(operationRef)
            if(attempt.exists()) {
                check(attempt.getString("requestKey")==requestKey) { "Operation belongs to another selection." }
                if(attempt.getString("status")=="complete") return@runTransaction true
            }
            val active=tx.get(client)
            val old=tx.get(archive)
            if(automatic) {
                if(!old.exists() || old.getString("trashId")!=entry.trashId || active.exists()) return@runTransaction true
                if(old.getString("status")!="purging") {
                    val policy=tx.get(db.document("settings/Configurations/elements/trashPolicy"))
                    val days=(policy.get("autoDeleteDays") as? Number)?.toInt() ?: 0
                    val deleted=old.getTimestamp("deletedAt")?.toDate()?.time
                    if(days !in listOf(3,7,30) || deleted==null || deleted>System.currentTimeMillis()-days*86_400_000L)
                        return@runTransaction true
                }
            }
            val reservations=if(operation=="trash") listOfNotNull(
                "settings/Identifiers/clients/${entry.id}",
                active.getString("clientNumber")?.takeIf(::validId)?.let { "settings/Identifiers/clients/$it" },
                active.getString("transactionNumber")?.takeIf(::validId)?.let { "settings/Identifiers/transactions/$it" })
                .distinct().map { tx.get(db.document(it)) } else emptyList()
            check(reservations.none { it.exists() && it.getString("clientId")!=entry.id }) { "An identifier belongs to another client. Repair it before moving to Trash." }
            when(operation) {
                "trash" -> {
                    check(active.exists() && !old.exists()) { "A selected client changed. Refresh your selection." }
                    tx.set(archive,mapOf("client" to active.data,"trashId" to entry.requestId,"deletedAt" to stamp,
                        "deletedBy" to actor.uid,"deletedByName" to actor.fullName,"status" to "trashed"))
                    tx.delete(client)
                    reservations.filterNot { it.exists() }.forEach { tx.set(it.reference,mapOf("clientId" to entry.id)) }
                }
                "restore","purge" -> {
                    check(old.exists() && old.getString("trashId")==entry.trashId && !active.exists()) {
                        "Trash changed or an active client already has this ID. Nothing was overwritten." }
                    if(old.getString("status")=="purging") check(operation=="purge" && old.getString("purgeOperationId")==entry.requestId) {
                        "Permanent deletion has started. Restoration is no longer available." }
                    @Suppress("UNCHECKED_CAST")
                    val original=old.get("client") as? Map<String,Any?> ?: error("Incomplete Trash record.")
                    if(operation=="restore") {
                        tx.set(client,original+("updatedAt" to stamp)); tx.delete(archive)
                    } else tx.update(archive,mapOf("status" to "purging","purgeOperationId" to entry.requestId))
                }
            }
            tx.set(operationRef,mapOf("operation" to operation,"requestKey" to requestKey,
                "actorId" to (attempt.getString("actorId") ?: actor.uid),
                "status" to if(operation=="purge") "pending" else "complete","updatedAt" to stamp))
            operation!="purge"
        }.await()
        if(complete) return
        while(true) {
            val payments=db.collection("payments").whereEqualTo("clientId",entry.id).limit(100).get(Source.SERVER).await().documents
            val renewals=client.collection("renewals").limit(100).get(Source.SERVER).await().documents
            val finished=db.runTransaction { tx ->
                mutations.actor(tx)
                val attempt=tx.get(operationRef)
                if(attempt.getString("status")=="complete") return@runTransaction true
                val old=tx.get(archive)
                val active=tx.get(client)
                check(old.exists() && old.getString("trashId")==entry.trashId &&
                    old.getString("purgeOperationId")==entry.requestId && !active.exists()) { "Trash changed during deletion. Refresh and retry." }
                val documents=(payments+renewals).map { tx.get(it.reference) }
                if(documents.none { it.exists() }) {
                    tx.delete(archive);tx.update(operationRef,mapOf("status" to "complete","updatedAt" to stamp))
                    true
                } else {
                    documents.filter { it.exists() }.forEach { tx.delete(it.reference) }; false
                }
            }.await()
            if(finished) return
        }
    }

    suspend fun purgeExpired() {
        val policy=db.document("settings/Configurations/elements/trashPolicy").get(Source.SERVER).await()
        val days=(policy.get("autoDeleteDays") as? Number)?.toInt() ?: 0
        val pending=db.collection("clientTrash").whereEqualTo("status","purging").limit(25).get(Source.SERVER).await().documents
        val expired=if(days in listOf(3,7,30)) db.collection("clientTrash")
            .whereLessThanOrEqualTo("deletedAt",Timestamp(System.currentTimeMillis()/1000-days*86400L,0))
            .limit(25).get(Source.SERVER).await().documents else emptyList()
        (pending+expired).distinctBy { it.id }.forEach { document ->
            val trashId=document.getString("trashId") ?: error("Missing Trash identifier.")
            val requestId=document.getString("purgeOperationId") ?: "purge-$trashId"
            mutate("purge",TrashSelection(document.id,trashId,requestId),automatic=true)
        }
    }
}
