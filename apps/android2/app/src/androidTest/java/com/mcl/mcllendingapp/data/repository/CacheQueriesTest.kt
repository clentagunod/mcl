package com.mcl.mcllendingapp.data.repository

import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.platform.app.InstrumentationRegistry
import com.mcl.mcllendingapp.data.local.CacheRecord
import com.mcl.mcllendingapp.data.local.MclDatabase
import com.mcl.mcllendingapp.data.local.PendingReceiptEntity
import com.mcl.mcllendingapp.data.mapper.SettingsMapper
import com.mcl.mcllendingapp.data.remote.FirebaseConfiguration
import com.mcl.mcllendingapp.domain.model.*
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class CacheQueriesTest {
    private lateinit var database: MclDatabase
    private lateinit var queries: CacheQueries
    private val json=Json { encodeDefaults=true;ignoreUnknownKeys=true }
    private val owner="verified-admin"

    @Before fun setUp() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        database=Room.inMemoryDatabaseBuilder(context,MclDatabase::class.java).build()
        queries=CacheQueries(database.cache(),json,SettingsMapper(json,FirebaseConfiguration(context)))
    }

    @After fun close()=database.close()

    private fun client(id: String,loan: String="initial",term: Int=45,name: String=id)=CacheRecord(
        owner,"clients",id,json.encodeToString(Client(id=id,firstName=name,lastName="Borrower",
            address="Tagum",cellphone="09171234567",principal=100.0,interest=15.0,
            approvalDate="2026-01-01",loanTermDays=term,activeLoanId=loan,dailyAmount=3.0)),
        search=name.lowercase(),sortKey=name,details=term.toString(),loanId=loan,
        amountCents=10000,extraCents=1500,date="2026-01-01")

    private fun payment(id: String,client: String,loan: String,amount: Long)=CacheRecord(
        owner,"payments",id,json.encodeToString(Payment(id,client,loan,LoanMath.pesos(amount),
            "2026-01-02","collector","Collector","Daily Payment",1L)),
        parentId=client,loanId=loan,date="2026-01-02",amountCents=amount,createdAt=1)

    @Test fun renewedLoanBalanceExcludesInitialReceipts()=runBlocking {
        database.cache().put(listOf(client("c","00002"),payment("old","c","initial",11500),
            payment("new","c","00002",2500)))
        queries.rebuildLoans(owner)
        val row=queries.page<Client>(owner,"clients",ListQuery(),true).items.single()
        assertEquals(25.0,row.totalPaid,0.0)
        assertEquals(90.0,row.outstanding,0.0)
    }

    @Test fun globalTotalsIncludeRowsBeyondCurrentPageAndRetainNegativePrincipalBalance()=runBlocking {
        database.cache().put(listOf(client("a"),client("b"),payment("p","a","initial",11500)))
        queries.rebuildLoans(owner)
        val first=queries.consolidation(owner,ListQuery(pageSize=1),true)
        assertEquals(2,first.total)
        assertTrue(first.hasMore)
        assertEquals(200.0,first.totals.getValue("principal"),0.0)
        assertEquals(115.0,first.totals.getValue("totalPayment"),0.0)
        assertEquals(85.0,first.totals.getValue("balance"),0.0)
        assertEquals(-15.0,first.items.single().balance,0.0)
    }

    @Test fun termFilterAndLiteralSearchDoNotExpandMatchSet()=runBlocking {
        database.cache().put(listOf(client("a",term=45,name="100% Real"),
            client("b",term=58,name="Other"),client("c",term=45,name="1000 Real")))
        val term=queries.page<Client>(owner,"clients",ListQuery(status="58"),true)
        assertEquals(listOf("b"),term.items.map { it.id })
        val literal=queries.page<Client>(owner,"clients",ListQuery(search="%"),true)
        assertEquals(listOf("a"),literal.items.map { it.id })
    }

    @Test fun trashLedgerDoesNotContributeToActiveDashboard()=runBlocking {
        database.cache().put(listOf(client("active"),payment("kept","archived","initial",10000)))
        queries.rebuildLoans(owner)
        val stats=queries.dashboard(owner,"2026-01-02")
        assertEquals(1,stats.totalClients)
        assertEquals(0.0,stats.todayCollection,0.0)
        assertEquals(115.0,stats.totalOutstanding,0.0)
    }

    @Test fun payingDayHistoryRemainsAccessibleAfterDay58()=runBlocking {
        val client=client("c")
        database.cache().put(listOf(client))
        val start=java.time.LocalDate.parse("2026-01-02")
        val receipts=(0 until 60).map { i ->
            val date=start.plusDays(i.toLong()).toString()
            payment("p$i","c","initial",1).copy(date=date,payload=json.encodeToString(
                Payment("p$i","c","initial",0.01,date,"collector","Collector")))
        }
        database.cache().put(receipts)
        val preview=queries.consolidation(owner,ListQuery(),true).items.single()
        assertEquals(58,preview.days.size)
        assertEquals(60,preview.totalPayingDays)
        val last=queries.collectionDays(owner,"c",2,25,true)
        assertEquals(60,last.total)
        assertEquals(60,last.items.last().day)
    }
    @Test fun renewalPagesStayPrivateUntilCompletedSnapshotIsPublished()=runBlocking {
        val dao=database.cache()
        val kind="renewals:c"
        val staging="__mcl_stage__:$owner:renewals-refresh"
        val old=CacheRecord(owner,kind,"old","old history")
        val unrelated=client("c")
        dao.put(listOf(old,unrelated))
        dao.put(listOf(CacheRecord(staging,kind,"first","first page")))
        assertEquals(old,dao.record(owner,kind,"old"))
        assertNull(dao.record(owner,kind,"first"))
        dao.put(listOf(CacheRecord(staging,kind,"last","last page")))
        database.withTransaction {
            dao.clearKind(owner,kind)
            dao.promoteKind(staging,owner,kind)
            dao.put(listOf(CacheRecord(owner,"renewalSync","c","{}")))
        }
        assertNull(dao.record(owner,kind,"old"))
        assertEquals("first page",dao.record(owner,kind,"first")?.payload)
        assertEquals("last page",dao.record(owner,kind,"last")?.payload)
        assertNotNull(dao.record(owner,"renewalSync","c"))
        assertEquals(unrelated,dao.record(owner,"clients","c"))
        assertNull(dao.record(staging,kind,"first"))
    }

    @Test fun failedRenewalRefreshRetainsPreviousHistoryAndSyncMarker()=runBlocking {
        val dao=database.cache()
        val kind="renewals:c"
        val staging="__mcl_stage__:$owner:renewals-failed"
        val old=CacheRecord(owner,kind,"old","old history")
        val marker=CacheRecord(owner,"renewalSync","c","{}",generation=1)
        dao.put(listOf(old,marker,CacheRecord(staging,kind,"new","incomplete history")))
        dao.discardStagedSnapshot(staging)
        assertEquals(old,dao.record(owner,kind,"old"))
        assertNull(dao.record(owner,kind,"new"))
        assertEquals(marker,dao.record(owner,"renewalSync","c"))
    }

    @Test fun abandonedRenewalCleanupIsScopedAndPreservesPublishedAndRecoveryRecords()=runBlocking {
        val dao=database.cache()
        val kind="renewals:c"
        val staging="__mcl_stage__:$owner:renewals-abandoned"
        val otherStage="__mcl_stage__:${owner}-other:renewals-abandoned"
        val abandoned=CacheRecord(staging,kind,"abandoned","incomplete history")
        val published=CacheRecord(owner,kind,"published","complete history")
        val marker=CacheRecord(owner,"renewalSync","c","{}",generation=1)
        val otherAccount=CacheRecord(otherStage,kind,"other","other account history")
        val recovery=CacheRecord(staging,"legacyReceipts","recovery","retained recovery")
        val pending=PendingReceiptEntity(owner,"pending-receipt","c","reserved payload",1)
        dao.put(listOf(abandoned,published,marker,otherAccount,recovery))
        dao.reserve(pending)

        dao.discardAbandonedStaging("__mcl_stage__:$owner:")

        assertNull(dao.record(staging,kind,"abandoned"))
        assertEquals(published,dao.record(owner,kind,"published"))
        assertEquals(marker,dao.record(owner,"renewalSync","c"))
        assertEquals(otherAccount,dao.record(otherStage,kind,"other"))
        assertEquals(recovery,dao.record(staging,"legacyReceipts","recovery"))
        assertEquals(pending,dao.pendingById(owner,"pending-receipt"))
    }

    @Test fun discardedPartialStageKeepsLastCompleteOwnerBalances()=runBlocking {
        database.cache().put(listOf(client("c"),payment("settled","c","initial",2500)))
        queries.rebuildLoans(owner)
        val before=queries.page<Client>(owner,"clients",ListQuery(),false).items.single()
        assertEquals(90.0,before.outstanding,0.0)
        val staging="__mcl_stage__:$owner:failed-request"
        database.cache().put(listOf(
            client("c").copy(owner=staging,amountCents=20000,payload=json.encodeToString(Client(id="c",principal=200.0,
                interest=15.0,loanTermDays=45,approvalDate="2026-01-01"))),
            payment("uncommitted","c","initial",5000).copy(owner=staging)))
        val during=queries.page<Client>(owner,"clients",ListQuery(),false).items.single()
        assertEquals(before,during)
        assertEquals(2500L,queries.paid(owner,"c","initial"))
        database.cache().discardStagedSnapshot(staging)
        assertEquals(before,queries.page<Client>(owner,"clients",ListQuery(),false).items.single())
        assertEquals(2500L,queries.paid(owner,"c","initial"))
    }

}
