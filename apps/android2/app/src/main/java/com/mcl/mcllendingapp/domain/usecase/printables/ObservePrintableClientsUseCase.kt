package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.model.PrintClientSearch
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.mapLatest

/** Searches the complete cached directory with website print-search ranking and bounded pages. */
@OptIn(ExperimentalCoroutinesApi::class)
class ObservePrintableClientsUseCase @Inject constructor(private val repository: AdminRepository) {
    operator fun invoke(query: ListQuery): Flow<Page<Client>> {
        val size = query.pageSize.coerceIn(1, 50)
        val sorted = query.copy(search = "", sort = "print", pageSize = size)
        if (PrintClientSearch.normalize(query.search).isBlank()) return repository.observeClients(sorted)
        return repository.observeClients(sorted.copy(page = 0, pageSize = 1)).mapLatest { backing ->
            val counts = IntArray(5)
            val firstFresh = scan(sorted) { client -> PrintClientSearch.rank(client, query.search)?.let { counts[it]++ } }
            val total = counts.sum()
            val page = query.page.coerceIn(0, maxOf(0, (total - 1) / size))
            if (total == 0) return@mapLatest Page<Client>(total = 0, page = 0, pageSize = size, fresh = backing.fresh && firstFresh)
            val from = page * size
            val until = minOf(total, from + size)
            val starts = IntArray(5)
            val ends = IntArray(5)
            var preceding = 0
            for (rank in counts.indices) {
                starts[rank] = (from - preceding).coerceIn(0, counts[rank])
                ends[rank] = (until - preceding).coerceIn(0, counts[rank])
                preceding += counts[rank]
            }
            val seen = IntArray(5)
            val buckets = Array(5) { mutableListOf<Client>() }
            val secondFresh = scan(sorted) { client ->
                val rank = PrintClientSearch.rank(client, query.search) ?: return@scan
                val index = seen[rank]++
                if (index >= starts[rank] && index < ends[rank]) buckets[rank].add(client)
            }
            Page(buckets.flatMap { it }, total, page, size, backing.fresh && firstFresh && secondFresh)
        }.flowOn(Dispatchers.Default)
    }

    private suspend fun scan(query: ListQuery, consume: (Client) -> Unit): Boolean {
        var page = 0
        var fresh = true
        do {
            currentCoroutineContext().ensureActive()
            val batch = repository.clientsPage(query.copy(page = page, pageSize = 100, search = "", sort = "print"))
            fresh = fresh && batch.fresh
            batch.items.forEach(consume)
            page++
        } while (batch.hasMore)
        return fresh
    }
}
