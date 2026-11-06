package com.mcl.mcllendingapp.data.repository

import androidx.sqlite.db.SimpleSQLiteQuery
import com.mcl.mcllendingapp.data.local.CacheDao
import com.mcl.mcllendingapp.data.local.CacheRecord
import com.mcl.mcllendingapp.data.mapper.SettingsMapper
import com.mcl.mcllendingapp.domain.model.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.util.Locale
import javax.inject.Inject

class CacheQueries @Inject constructor(private val dao: CacheDao, private val json: Json,
    private val settingsMapper: SettingsMapper) {
    suspend fun number(sql: String, vararg args: Any?): Long =
        dao.number(SimpleSQLiteQuery(sql, args))
    suspend fun rows(sql: String, vararg args: Any?): List<CacheRecord> =
        dao.rows(SimpleSQLiteQuery(sql, args))

    private fun filter(owner: String, kind: String, q: ListQuery): Pair<String, List<Any?>> {
        val clauses = mutableListOf("owner = ?", "kind = ?")
        val args = mutableListOf<Any?>(owner, kind)
        if (kind == "holidays" && Regex("^\\d{4}-\\d{2}$").matches(q.search)) {
            clauses += "date LIKE ?"; args += q.search + "-%"
        } else if (q.search.isNotBlank()) {
            clauses += "search LIKE ? ESCAPE '\\'"
            val term = q.search.trim().lowercase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            args += "%$term%"
        }
        if (kind == "clients" && q.status in listOf("45","50","58")) {
            clauses += "details = ?"; args += q.status
        } else if (kind == "holidays" && q.status in listOf("upcoming", "past")) {
            clauses += if (q.status == "upcoming") "date >= ?" else "date < ?"
            args += LoanMath.today()
        } else if (q.status != "all") { clauses += "status = ?"; args += q.status }
        if (kind == "accounts" && q.role != "all") { clauses += "parentId = ?"; args += q.role }
        return clauses.joinToString(" AND ") to args
    }

    private fun order(kind: String, q: ListQuery): String = when {
        kind == "clients" && q.sort == "outstanding" -> "MAX(0,amountCents+extraCents-COALESCE((SELECT SUM(p.amountCents) FROM records p WHERE p.owner=records.owner AND p.kind='payments' AND p.parentId=records.id AND p.loanId=records.loanId),0)) DESC,sortKey,id"
        kind == "clients" && q.sort == "dueDate" -> "date,sortKey,id"
        q.sort == "recent" -> "createdAt DESC, id"
        q.sort == "name_desc" -> "sortKey DESC, id"
        q.sort == "date_desc" -> "date DESC, id"
        kind == "trash" -> "createdAt DESC, id"
        kind.startsWith("renewals:") -> "amountCents DESC, id"
        kind == "clients" && q.sort == "default" -> "CASE status WHEN 'due' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, sortKey, id"
        else -> "sortKey, id"
    }

    private suspend fun counts(owner: String, kind: String): Map<String, Int> {
        suspend fun count(extra: String = "", vararg args: Any?): Int =
            number("SELECT COUNT(*) FROM records WHERE owner=? AND kind=? $extra", owner, kind, *args).toInt()
        return when(kind) {
            "accounts" -> mapOf("total" to count(), "active" to count("AND status='active'"),
                "admins" to count("AND parentId='admin'"), "collectors" to count("AND parentId='collector'"))
            "holidays" -> mapOf("total" to count(), "upcoming" to count("AND date>=?", LoanMath.today()))
            "trash" -> mapOf("total" to count(), "recoverable" to count("AND status='trashed'"))
            "clients" -> mapOf("total" to count(), "incomplete" to count("AND parentId='incomplete'"))
            else -> emptyMap()
        }
    }

    suspend inline fun <reified T> page(owner: String, kind: String, query: ListQuery,
        fresh: Boolean): Page<T> {
        val result = recordPage(owner, kind, query, fresh)
        return Page(result.items.map { jsonDecode<T>(it.payload) }, result.total, result.page,
            result.pageSize, fresh, result.counts)
    }

    fun <T> decode(payload: String, serializer: kotlinx.serialization.KSerializer<T>): T =
        json.decodeFromString(serializer, payload)

    @PublishedApi internal inline fun <reified T> jsonDecode(payload: String): T =
        codec.decodeFromString(payload)
    @PublishedApi internal val codec: Json get() = json

    suspend fun recordPage(owner: String, kind: String, query: ListQuery, fresh: Boolean): Page<CacheRecord> {
        val (where, args) = filter(owner, kind, query)
        val total = number("SELECT COUNT(*) FROM records WHERE $where", *args.toTypedArray()).toInt()
        val size = query.pageSize.coerceIn(1, 100)
        val page = query.page.coerceIn(0, ((total - 1).coerceAtLeast(0) / size))
        val records = rows("SELECT * FROM records WHERE $where ORDER BY ${order(kind, query)} LIMIT ? OFFSET ?",
            *args.toTypedArray(), size, page * size)
        return Page(records, total, page, size, fresh, counts(owner, kind))
    }

    suspend fun ids(owner: String, kind: String, query: ListQuery): List<String> {
        val result = mutableListOf<String>()
        var page = 0
        do {
            val batch = recordPage(owner, kind, query.copy(page = page, pageSize = 100), false)
            result += batch.items.map { it.id }
            if (!batch.hasMore) break
            page++
        } while (true)
        return result
    }

    suspend fun settings(owner: String): AppSettings {
        val raw = settingsMapper.paths.mapNotNull { (key, path) ->
            dao.record(owner, "settings", path)?.payload?.let { key to it }
        }.toMap()
        return settingsMapper.read(raw)
    }

    suspend fun rebuildLoans(owner: String) {
        var offset = 0
        while (true) {
            val records = rows("SELECT * FROM records WHERE owner=? AND kind='clients' ORDER BY id LIMIT 100 OFFSET ?", owner, offset)
            if (records.isEmpty()) break
            val derived = records.map { record ->
                val client = json.decodeFromString<Client>(record.payload)
                val holidaySet = holidays(owner, client.approvalDate)
                val paid = paid(owner, client.id, client.activeLoanId)
                val last = dao.groups(SimpleSQLiteQuery("SELECT COALESCE(MAX(date),'') AS label, 0 AS value FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? AND date!=''", arrayOf(owner, client.id, client.activeLoanId)))
                    .firstOrNull()?.label?.takeIf(String::isNotBlank)
                val item = LoanMath.summarize(client, paid, last, holidaySet)
                record.copy(payload = json.encodeToString(item), date = item.dueDate, status = item.status)
            }
            dao.put(derived)
            offset += records.size
        }
    }

    suspend fun holidays(owner: String, from: String): Set<String> =
        rows("SELECT * FROM records WHERE owner=? AND kind='holidays' AND date>=? AND date<=? ORDER BY date LIMIT 3661",
            owner, from, LocalDate.parse(from).plusDays(3660).toString()).map { it.date }.toSet()

    suspend fun paid(owner: String, clientId: String, loanId: String): Long =
        number("SELECT COALESCE(SUM(amountCents),0) FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=?", owner, clientId, loanId)

    suspend fun paymentPage(owner: String, clientId: String?, loanId: String?, date: String?,
        page: Int, pageSize: Int, fresh: Boolean): Page<Payment> {
        val where = "owner=? AND kind='payments' AND (? IS NULL OR parentId=?) AND (? IS NULL OR loanId=?) AND (? IS NULL OR date=?)"
        val args = arrayOf(owner, clientId, clientId, loanId, loanId, date, date)
        val total = number("SELECT COUNT(*) FROM records WHERE $where", *args).toInt()
        val size = pageSize.coerceIn(1,100)
        val boundedPage = page.coerceIn(0,(total-1).coerceAtLeast(0)/size)
        val records = rows("SELECT * FROM records WHERE $where ORDER BY date DESC,createdAt DESC,id LIMIT ? OFFSET ?",
            *args, size, boundedPage*size)
        val items = records.map { row ->
            val payment = json.decodeFromString<Payment>(row.payload)
            val client = dao.record(owner,"clients",payment.clientId)?.let { json.decodeFromString<Client>(it.payload) }
            val before = number("SELECT COALESCE(SUM(amountCents),0) FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? AND date<?",
                owner,payment.clientId,payment.loanId,payment.paymentDate)
            val day = if (client != null && before < LoanMath.cents(client.principal)+LoanMath.cents(client.interest))
                number("SELECT COUNT(DISTINCT date) FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? AND date<=?",
                    owner,payment.clientId,payment.loanId,payment.paymentDate).toInt() else null
            payment.copy(indexDay = day)
        }
        return Page(items,total,boundedPage,size,fresh)
    }

    private suspend fun labels(sql: String, vararg args: Any?): List<String> =
        dao.groups(SimpleSQLiteQuery(sql,args)).map { it.label }

    suspend fun summary(owner: String, date: String, q: ListQuery, fresh: Boolean): Page<DailySummaryRow> {
        val clients = page<Client>(owner,"clients",q.copy(sort="name"),fresh)
        val settings = settings(owner)
        val items = clients.items.map { client ->
            val args = arrayOf(owner,client.id,date)
            val where = "owner=? AND kind='payments' AND parentId=? AND date=?"
            val total = number("SELECT COALESCE(SUM(amountCents),0) FROM records WHERE $where",*args)
            val collectors = labels("SELECT DISTINCT CASE WHEN search='' THEN 'Unknown collector' ELSE search END AS label,0 AS value FROM records WHERE $where ORDER BY search",*args).joinToString("; ")
            val notes = labels("SELECT DISTINCT CASE WHEN details='' THEN ? ELSE details END AS label,0 AS value FROM records WHERE $where",settings.general.defaultPaymentNote,*args).joinToString("; ")
            val loans = labels("SELECT loanId AS label,MIN(createdAt) AS value FROM records WHERE $where GROUP BY loanId ORDER BY MIN(createdAt),loanId",*args)
            val transactions = loans.map { if (it=="initial") client.originalTransactionNumber.ifBlank { client.transactionNumber.ifBlank { "Pending" } } else it }.distinct()
            DailySummaryRow(client,transactions.joinToString("; ").ifBlank { client.transactionNumber.ifBlank { "Pending" } },LoanMath.pesos(total),collectors,notes)
        }
        return Page(items,clients.total,clients.page,clients.pageSize,fresh)
    }

    suspend fun collectionDays(owner: String, clientId: String, page: Int, pageSize: Int, fresh: Boolean): Page<CollectionDay> {
        val client=dao.record(owner,"clients",clientId)?.let { json.decodeFromString<Client>(it.payload) }
            ?: return Page(fresh=fresh)
        val args=arrayOf(owner,clientId,client.activeLoanId)
        val where="owner=? AND kind='payments' AND parentId=? AND loanId=?"
        val total=number("SELECT COUNT(DISTINCT date) FROM records WHERE $where",*args).toInt()
        val size=pageSize.coerceIn(1,100)
        val bounded=page.coerceIn(0,(total-1).coerceAtLeast(0)/size)
        val days=dao.groups(SimpleSQLiteQuery("SELECT date AS label,SUM(amountCents) AS value FROM records WHERE $where GROUP BY date ORDER BY date LIMIT ? OFFSET ?",
            arrayOf<Any?>(*args,size,bounded*size))).mapIndexed { i,row -> CollectionDay(bounded*size+i+1,row.label,
                LoanMath.pesos(row.value),number("SELECT COUNT(*) FROM records WHERE $where AND date=?",*args,row.label).toInt()) }
        return Page(days,total,bounded,size,fresh)
    }

    suspend fun consolidation(owner: String, q: ListQuery, fresh: Boolean): Page<ConsolidationRow> {
        val clients = page<Client>(owner,"clients",q.copy(sort="name"),fresh)
        val items = clients.items.map { client ->
            val days = dao.groups(SimpleSQLiteQuery("SELECT date AS label,SUM(amountCents) AS value FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? GROUP BY date ORDER BY date LIMIT 58",arrayOf(owner,client.id,client.activeLoanId)))
                .mapIndexed { i,row -> CollectionDay(i+1,row.label,LoanMath.pesos(row.value),
                    number("SELECT COUNT(*) FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=? AND date=?",owner,client.id,client.activeLoanId,row.label).toInt()) }
            val total = paid(owner,client.id,client.activeLoanId)
            ConsolidationRow(client,days,LoanMath.pesos(total),client.principal,
                LoanMath.pesos(LoanMath.cents(client.principal)-total),
                number("SELECT COUNT(DISTINCT date) FROM records WHERE owner=? AND kind='payments' AND parentId=? AND loanId=?",owner,client.id,client.activeLoanId).toInt())
        }
        val (where,args)=filter(owner,"clients",q)
        val principal=number("SELECT COALESCE(SUM(amountCents),0) FROM records WHERE $where",*args.toTypedArray())
        val paid=number("WITH matching AS (SELECT * FROM records WHERE $where) SELECT COALESCE(SUM(p.amountCents),0) FROM records p JOIN matching c ON c.owner=p.owner AND c.id=p.parentId AND c.loanId=p.loanId WHERE p.kind='payments'",*args.toTypedArray())
        return Page(items,clients.total,clients.page,clients.pageSize,fresh,totals=mapOf(
            "totalPayment" to LoanMath.pesos(paid),"principal" to LoanMath.pesos(principal),"balance" to LoanMath.pesos(principal-paid)))
    }

    suspend fun dashboard(owner: String, date: String): DashboardStats {
        val settings = settings(owner)
        suspend fun n(sql: String,vararg args: Any?)=number(sql,owner,*args)
        val clients = n("SELECT COUNT(*) FROM records WHERE owner=? AND kind='clients'").toInt()
        val due = page<Client>(owner,"clients",ListQuery(status="due",pageSize=settings.general.dueClientsLimit,sort="dueDate"),false)
        val principal = n("SELECT COALESCE(SUM(amountCents),0) FROM records WHERE owner=? AND kind='clients'")
        val interest = n("SELECT COALESCE(SUM(extraCents),0) FROM records WHERE owner=? AND kind='clients'")
        val joined = "FROM records p JOIN records c ON c.owner=p.owner AND c.id=p.parentId AND c.kind='clients' WHERE p.owner=? AND p.kind='payments'"
        val paid = n("SELECT COALESCE(SUM(p.amountCents),0) $joined AND p.loanId=c.loanId")
        val outstanding = n("SELECT COALESCE(SUM(MAX(0,c.amountCents+c.extraCents-(SELECT COALESCE(SUM(p.amountCents),0) FROM records p WHERE p.owner=c.owner AND p.kind='payments' AND p.parentId=c.id AND p.loanId=c.loanId))),0) FROM records c WHERE c.owner=? AND c.kind='clients'")
        val calendar = (29L downTo 0L).associate { LocalDate.parse(date).minusDays(it).toString() to 0.0 }.toMutableMap()
        dao.groups(SimpleSQLiteQuery("SELECT p.date AS label,SUM(p.amountCents) AS value $joined AND p.date>=? AND p.date<=? GROUP BY p.date",arrayOf(owner,calendar.keys.first(),date)))
            .forEach { calendar[it.label]=LoanMath.pesos(it.value) }
        val dayCounts = dao.groups(SimpleSQLiteQuery("SELECT p.date AS label,COUNT(*) AS value $joined AND p.date>=? AND p.date<=? GROUP BY p.date",arrayOf(owner,calendar.keys.first(),date))).associate { it.label to it.value.toInt() }
        val collectorMoney = dao.groups(SimpleSQLiteQuery("SELECT p.status AS label,SUM(p.amountCents) AS value $joined AND p.date=? GROUP BY p.status",arrayOf(owner,date))).associate { it.label to LoanMath.pesos(it.value) }.toMutableMap()
        val collectorCounts = dao.groups(SimpleSQLiteQuery("SELECT p.status AS label,COUNT(*) AS value $joined AND p.date=? GROUP BY p.status",arrayOf(owner,date))).associate { it.label to it.value.toInt() }
        val latest = dao.groups(SimpleSQLiteQuery("SELECT p.status AS label,MAX(p.createdAt) AS value $joined AND p.date=? GROUP BY p.status",arrayOf(owner,date))).associate { it.label to it.value }
        val names = mutableMapOf<String,String>()
        var accountPage=0
        do {
            val batch=page<UserAccount>(owner,"accounts",ListQuery(role="collector",page=accountPage,pageSize=100),false)
            batch.items.forEach { names[it.uid]=it.fullName; collectorMoney.putIfAbsent(it.uid,0.0) }
            if(!batch.hasMore) break
            accountPage++
        } while(true)
        val receiptNames = rows("SELECT p.* $joined AND p.date=? GROUP BY p.status ORDER BY p.createdAt DESC LIMIT 1000",owner,date)
        receiptNames.forEach { names.putIfAbsent(it.status,it.search.ifBlank { "Unknown" }) }
        val recent = rows("SELECT p.* $joined ORDER BY CASE WHEN p.createdAt=0 THEN 9223372036854775807 ELSE p.createdAt END DESC,p.date DESC,p.id LIMIT ?",owner,settings.general.recentPaymentsLimit).map { json.decodeFromString<Payment>(it.payload) }
        return DashboardStats(clients,due.total,
            n("SELECT COUNT(*) FROM records WHERE owner=? AND kind='clients' AND status='pending'").toInt(),
            n("SELECT COUNT(*) FROM records WHERE owner=? AND kind='clients' AND status='paid'").toInt(),
            LoanMath.pesos(principal),LoanMath.pesos(interest),LoanMath.pesos(principal+interest),
            LoanMath.pesos(paid),LoanMath.pesos(outstanding),
            LoanMath.pesos(n("SELECT COALESCE(SUM(p.amountCents),0) $joined AND p.date=?",date)),
            LoanMath.pesos(n("SELECT COALESCE(SUM(p.amountCents),0) $joined AND substr(p.date,1,7)=?",date.take(7))),
            n("SELECT COUNT(*) FROM records WHERE owner=? AND kind='accounts' AND parentId='collector' AND status='active'").toInt(),
            if(principal+interest==0L) 0.0 else paid.toDouble()/(principal+interest)*100,
            due.items,recent,calendar,collectorMoney,dayCounts,collectorCounts,latest,names,
            recent.map { it.clientId }.distinct().mapNotNull { id -> dao.record(owner,"clients",id)?.let {
                id to json.decodeFromString<Client>(it.payload).displayName
            } }.toMap())
    }
}
