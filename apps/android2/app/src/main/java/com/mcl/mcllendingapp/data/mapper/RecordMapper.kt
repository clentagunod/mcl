package com.mcl.mcllendingapp.data.mapper

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.mcl.mcllendingapp.data.local.CacheRecord
import com.mcl.mcllendingapp.domain.model.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Locale
import javax.inject.Inject

class RecordMapper @Inject constructor(private val json: Json) {
    fun client(id: String, values: Map<String, Any?>): Client {
        fun text(key: String) = values[key] as? String ?: ""
        fun money(key: String) = (values[key] as? Number)?.toDouble() ?: 0.0
        val principal = money("principal")
        val interest = money("interest")
        val date = text("approvalDate")
        val term = (values["loanTermDays"] as? Number)?.toInt() ?: 0
        require(LoanMath.money(principal) > 0 && LoanMath.money(interest) >= 0 &&
            LoanMath.validDate(date) && term in LoanMath.loanTerms) {
            "Client $id contains invalid loan details. An administrator must repair the source record."
        }
        val revision = (values["updatedAt"] as? Timestamp)?.let { "${it.seconds}:${it.nanoseconds}" }.orEmpty()
        val client = Client(id = id, firstName = text("firstName"), middleName = text("middleName"),
            lastName = text("lastName"), address = text("address"), cellphone = text("cellphone"),
            principal = principal, interest = interest, loanTermDays = term, approvalDate = date,
            dailyAmount = money("dailyAmount").takeIf { it.isFinite() && it > 0 } ?: 0.0,
            clientNumber = text("clientNumber"), transactionNumber = text("transactionNumber"),
            activeLoanId = text("activeLoanId").ifBlank { "initial" },
            originalTransactionNumber = text("originalTransactionNumber"),
            renewalCount = (values["renewalCount"] as? Number)?.toInt() ?: 0, revision = revision)
        return client.copy(dailyAmount = LoanMath.dailyPayable(client))
    }

    fun payment(id: String, values: Map<String, Any?>): Payment {
        val amount = (values["amount"] as? Number)?.toDouble() ?: 0.0
        val date = values["paymentDate"] as? String ?: ""
        val clientId = values["clientId"] as? String ?: ""
        require(LoanMath.money(amount) > 0 && LoanMath.validDate(date) && clientId.isNotBlank()) {
            "Payment $id contains invalid financial details. Repair the source record."
        }
        return Payment(id, clientId, values["loanId"] as? String ?: "initial", amount, date,
            values["collectorId"] as? String ?: "", values["collectorName"] as? String ?: "",
            values["notes"] as? String ?: values["note"] as? String ?: "",
            (values["createdAt"] as? Timestamp)?.toDate()?.time)
    }

    fun account(id: String, values: Map<String, Any?>): UserAccount {
        val role = values["role"] as? String ?: ""
        require(role in listOf("admin", "collector", "developer")) { "Invalid account role." }
        return UserAccount(id, values["fullName"] as? String ?: "", values["email"] as? String ?: "",
            values["phone"] as? String ?: "", role, values["active"] != false,
            (values["createdAt"] as? Timestamp)?.toDate()?.time)
    }

    fun renewal(id: String, values: Map<String, Any?>): RenewalRecord {
        @Suppress("UNCHECKED_CAST")
        fun loan(key: String): Client {
            val map = values[key] as? Map<String, Any?> ?: error("Incomplete renewal history.")
            return client(map["id"] as? String ?: error("Missing historical client ID."), map)
        }
        return RenewalRecord(id, (values["sequence"] as? Number)?.toInt() ?: 0,
            loan("previousLoan"), loan("newLoan"), (values["totalPaid"] as? Number)?.toDouble() ?: 0.0,
            values["paidOn"] as? String ?: "", values["dueDate"] as? String ?: "",
            values["newDueDate"] as? String ?: "", values["approvedBy"] as? String ?: "",
            values["approvedByName"] as? String ?: "", values["notes"] as? String ?: "",
            (values["createdAt"] as? Timestamp)?.toDate()?.time)
    }

    @Suppress("UNCHECKED_CAST")
    fun record(owner: String, kind: String, document: DocumentSnapshot, generation: Long): CacheRecord {
        val values = document.data ?: error("A record disappeared during synchronization.")
        val raw = FirestoreCodec.encode(values)
        val base = CacheRecord(owner, kind, document.id, raw, raw = raw, generation = generation)
        return when {
            kind == "clients" -> {
                val item = client(document.id, values)
                base.copy(payload = json.encodeToString(item), search = listOf(item.fullName, item.displayName,
                    item.cellphone, item.address, item.publicId, item.transactionNumber).joinToString(" ").lowercase(Locale.ROOT),
                    sortKey = "${item.lastName}, ${item.firstName} ${item.middleName}".lowercase(Locale.ROOT), loanId = item.activeLoanId,
                    details = item.loanTermDays.toString(),
                    parentId = if (item.clientNumber.isBlank() || item.transactionNumber.isBlank() || ((values["dailyAmount"] as? Number)?.toDouble() ?: 0.0) <= 0) "incomplete" else "",
                    date = item.approvalDate, amountCents = LoanMath.cents(item.principal),
                    extraCents = LoanMath.cents(item.interest))
            }
            kind == "payments" -> {
                val item = payment(document.id, values)
                base.copy(payload = json.encodeToString(item), parentId = item.clientId, loanId = item.loanId,
                    sortKey = item.paymentDate, date = item.paymentDate, amountCents = LoanMath.cents(item.amount),
                    createdAt = item.createdAt ?: 0, search = item.collectorName, status = item.collectorId, details = item.notes.trim())
            }
            kind == "accounts" -> {
                val item = account(document.id, values)
                base.copy(payload = json.encodeToString(item), search = "${item.fullName} ${item.email} ${item.phone}".lowercase(Locale.ROOT),
                    sortKey = item.fullName.lowercase(Locale.ROOT), status = if (item.active) "active" else "inactive",
                    parentId = item.role, createdAt = item.createdAt ?: 0)
            }
            kind == "holidays" -> {
                val item = Holiday(values["date"] as? String ?: document.id, values["name"] as? String ?: "")
                require(LoanMath.validDate(item.date)) { "Invalid holiday ${document.id}." }
                base.copy(payload = json.encodeToString(item), date = item.date, sortKey = item.date,
                    search = "${item.date} ${item.name}".lowercase(Locale.ROOT))
            }
            kind == "trash" -> {
                val item = TrashedClient(document.id, client(document.id, values["client"] as? Map<String, Any?> ?: error("Incomplete Trash record.")),
                    values["trashId"] as? String ?: error("Missing Trash ID."),
                    (values["deletedAt"] as? Timestamp)?.toDate()?.time, values["deletedByName"] as? String ?: "",
                    values["status"] as? String ?: "trashed")
                base.copy(payload = json.encodeToString(item), search = "${item.client.fullName} ${item.client.publicId} ${item.client.address} ${item.client.cellphone} ${item.client.transactionNumber}".lowercase(Locale.ROOT),
                    status = item.status, createdAt = item.deletedAt ?: 0, sortKey = item.client.displayName.lowercase(Locale.ROOT))
            }
            kind.startsWith("renewals:") -> {
                val item = renewal(document.id, values)
                base.copy(payload = json.encodeToString(item), createdAt = item.createdAt ?: 0,
                    amountCents = item.sequence.toLong())
            }
            else -> base
        }
    }
}
