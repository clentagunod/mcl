package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.model.PrintClientSearch
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import java.lang.reflect.Proxy
import java.util.Locale
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ObservePrintableClientsUseCaseTest {
    @Test fun editsOutsideTheFirstBackingRowRefreshSearchEvenWhenBackingPageIsEqual() = runTest {
        val stable = Client(id = "stable", firstName = "Ana", lastName = "A")
        val changed = Client(id = "changed", firstName = "Other", lastName = "Zulu")
        var directory = listOf(stable, changed)
        val backing = Page(listOf(stable), 2, 0, 1, true)
        val firstResultDelivered = CompletableDeferred<Unit>()
        val repository = Proxy.newProxyInstance(AdminRepository::class.java.classLoader, arrayOf(AdminRepository::class.java)) { _, method, arguments ->
            when (method.name) {
                "observeClients" -> flow {
                    emit(backing)
                    firstResultDelivered.await()
                    directory = listOf(stable, changed.copy(firstName = "José"))
                    emit(backing)
                }
                "clientsPage" -> {
                    val requested = arguments!!.first() as ListQuery
                    Page(directory.drop(requested.page * requested.pageSize).take(requested.pageSize),
                        directory.size, requested.page, requested.pageSize, true)
                }
                else -> error("Unexpected repository access: " + method.name)
            }
        } as AdminRepository

        val results = ObservePrintableClientsUseCase(repository)(ListQuery(search = "Jose"))
            .onEach { firstResultDelivered.complete(Unit) }.take(2).toList()

        assertEquals(0, results.first().total)
        assertEquals(listOf("changed"), results.last().items.map { it.id })
        assertEquals(1, results.last().total)
    }

    @Test fun matchesAcrossAllCachePagesAreRankedBeforeSelectingTheRequestedPage() = runTest {
        val directory = ((0 until 240).map { index ->
            Client(id = "row-" + index.toString().padStart(3, '0'), lastName = "Family" + index.toString().padStart(3, '0'),
                firstName = if (index < 20) "José" else "Other", middleName = if (index < 20) "Cruz" else "",
                clientNumber = "mcl" + (1000 + index))
        } + listOf(
            Client(id = "exact-id", lastName = "Zulu", firstName = "Other", clientNumber = "jose-cruz"),
            Client(id = "exact-name", lastName = "José", firstName = "Cruz", clientNumber = "special-name"),
            Client(id = "id-prefix", lastName = "Yarrow", firstName = "Other", clientNumber = "josecruz001"),
            Client(id = "name-prefix", lastName = "José", firstName = "Cruzado", clientNumber = "special-prefix")
        )).sortedWith(compareBy<Client> { PrintClientSearch.summaryName(it).lowercase(Locale.ROOT) }.thenBy { it.id })
        val reads = mutableListOf<ListQuery>()
        val watches = mutableListOf<ListQuery>()
        val repository = Proxy.newProxyInstance(AdminRepository::class.java.classLoader, arrayOf(AdminRepository::class.java)) { _, method, arguments ->
            val query = arguments?.firstOrNull() as? ListQuery
            when (method.name) {
                "observeClients" -> {
                    watches.add(requireNotNull(query))
                    flowOf(Page(directory.take(1), directory.size, 0, 1, true))
                }
                "clientsPage" -> {
                    val requested = requireNotNull(query)
                    reads.add(requested)
                    Page(directory.drop(requested.page * requested.pageSize).take(requested.pageSize), directory.size,
                        requested.page, requested.pageSize, true)
                }
                else -> throw UnsupportedOperationException("Unexpected repository access: " + method.name)
            }
        } as AdminRepository
        val search = ObservePrintableClientsUseCase(repository)
        val first = search(ListQuery(search = "José Cruz", pageSize = 3)).first()
        assertEquals(listOf("exact-id", "exact-name", "id-prefix"), first.items.map { it.id })
        val second = search(ListQuery(search = "José Cruz", page = 1, pageSize = 3)).first()
        assertEquals(listOf("name-prefix", "row-000", "row-001"), second.items.map { it.id })
        assertEquals(24, second.total)
        assertTrue(second.fresh)
        assertTrue(reads.any { it.page >= 2 })
        assertTrue(reads.all { it.search.isBlank() && it.pageSize == 100 && it.sort == "print" })
        assertTrue(watches.all { it.search.isBlank() && it.page == 0 && it.pageSize == 1 && it.sort == "print" })
    }
}
