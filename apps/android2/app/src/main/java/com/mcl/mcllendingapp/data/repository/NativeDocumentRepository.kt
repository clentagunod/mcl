package com.mcl.mcllendingapp.data.repository

import com.mcl.mcllendingapp.util.documents.*

import android.content.Context
import android.net.Uri
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.DocumentArtifact
import com.mcl.mcllendingapp.domain.model.DocumentPreview
import com.mcl.mcllendingapp.domain.model.DocumentRequest
import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.model.Payment
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.OutputStream
import java.math.BigDecimal
import java.time.LocalDate
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.inject.Inject
import kotlin.math.ceil
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

class NativeDocumentRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val repository: AdminRepository,
    private val engine: PrintDocumentEngine,
    private val notes: PromissoryDocxExporter
) : DocumentRepository {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    override suspend fun preview(request: DocumentRequest): DocumentPreview = withContext(Dispatchers.IO) {
        val snapshot = snapshot(request, false)
        try {
            if (snapshot.selectedCount == 0) return@withContext DocumentPreview("", 0, 210.0, 297.0, 0, 0, 0, snapshot.cached)
            val position = request.previewIndex.coerceIn(0, max(0, snapshot.positions - 1))
            val group = groups(snapshot, request).drop(position).first()
            val startIndex = if (request.kind == "summary") groups(snapshot, request).take(position).sumOf { it.size } else 0
            val output = engine.render(job(request, snapshot, group, position, startIndex))
            DocumentPreview(output.html, snapshot.pages, output.widthMm, output.heightMm, snapshot.selectedCount, position, snapshot.positions, snapshot.cached)
        } finally { snapshot.file.delete() }
    }

    override suspend fun export(request: DocumentRequest, format: String): DocumentArtifact = withContext(Dispatchers.IO) {
        require(format in setOf("html", "docx")) { "Choose a supported document format." }
        val snapshot = snapshot(request, true)
        val kind = PrintDocumentKind.entries.first { it.key == request.kind }
        val multiple = format == "docx" && kind != PrintDocumentKind.SUMMARY && snapshot.selectedCount > 1
        val extension = if (format == "html") "html" else if (multiple) "zip" else "docx"
        val output = File.createTempFile("mcl-document-", "." + extension, context.cacheDir)
        try {
            require(snapshot.selectedCount > 0) { "Choose at least one client." }
            output.outputStream().buffered().use { stream ->
                when {
                    format == "html" -> writeHtml(request, snapshot, stream)
                    kind == PrintDocumentKind.SUMMARY -> {
                        val template = job(request, snapshot, emptyList(), 0)
                        val writer = WordDocumentWriter(stream, template, engine, logo())
                        records(snapshot).forEach { currentCoroutineContext().ensureActive(); writer.append(it.client, it.payments) }
                        writer.finish(snapshot.total, snapshot.selectedCount, snapshot.withCollections)
                    }
                    multiple -> {
                        val archive = ZipOutputStream(stream)
                        records(snapshot).forEachIndexed { index, record ->
                            currentCoroutineContext().ensureActive()
                            val bytes = ByteArrayOutputStream()
                            writeBorrower(request, snapshot, record, bytes)
                            archive.putNextEntry(ZipEntry(kind.key + "-" + filename(engine.publicId(record.client)) + "-" + (index + 1) + ".docx"))
                            bytes.writeTo(archive)
                            archive.closeEntry()
                        }
                        archive.finish()
                        archive.flush()
                    }
                    else -> writeBorrower(request, snapshot, records(snapshot).first(), stream)
                }
            }
            val size = engine.dimensions(request.layout, kind, snapshot.maxTermDays)
            DocumentArtifact(output.absolutePath, kind.key + "-" + request.date + (if (multiple) "-docx" else "") + "." + extension,
                when (extension) { "html" -> "text/html"; "zip" -> "application/zip"; else -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, size.first, size.second)
        } catch (error: Throwable) { output.delete(); throw error }
        finally { snapshot.file.delete() }
    }

    override suspend fun save(artifact: DocumentArtifact, destination: String) = withContext(Dispatchers.IO) {
        val file = ownedFile(artifact)
        require(file.exists()) { "The temporary document has expired. Export it again." }
        context.contentResolver.openOutputStream(Uri.parse(destination), "w").use { output ->
            requireNotNull(output) { "The chosen document destination is unavailable." }
            file.inputStream().use { it.copyTo(output) }
        }
        Unit
    }

    override fun discard(artifact: DocumentArtifact) { runCatching { ownedFile(artifact).delete() } }

    private fun ownedFile(artifact: DocumentArtifact): File = File(artifact.path).canonicalFile.also {
        require(it.parentFile == context.cacheDir.canonicalFile && it.name.startsWith("mcl-document-"))
    }

    private suspend fun snapshot(request: DocumentRequest, requireFresh: Boolean): PrintSnapshot {
        require(PrintDocumentKind.entries.any { it.key == request.kind }) { "Choose a supported document type." }
        require(engine.valid(request.layout)) { "Paper dimensions must be 70–600 mm, margins 0–30 mm and font size 6–18 pt." }
        val date = runCatching { LocalDate.parse(request.date) }.getOrElse { throw IllegalArgumentException("Choose a valid collection date.") }
        require(request.kind != "summary" || !date.isAfter(LocalDate.parse(com.mcl.mcllendingapp.domain.model.LoanMath.today()))) { "Collection date cannot be in the future." }
        val file = File.createTempFile("mcl-print-snapshot-", ".jsonl", context.cacheDir)
        var selectedCount = 0
        var availableCount = 0
        var total = BigDecimal.ZERO
        var withCollections = 0
        var maxTerm = 45
        var cached = false
        var physicalPages = 0
        try {
            val initial = repository.clientsPage(ListQuery(pageSize = 1))
            availableCount = initial.total
            cached = !initial.fresh
            file.bufferedWriter().use { writer ->
                suspend fun append(client: Client) {
                    currentCoroutineContext().ensureActive()
                    if (!request.selection.includes(client)) return
                    require(client.clientNumber.isNotBlank() && client.transactionNumber.isNotBlank()) { "Client numbers are incomplete. Use Complete existing client records in Settings." }
                    val (payments, stale) = payments(client, request)
                    cached = cached || stale
                    val record = PrintSnapshotRecord(client, payments)
                    writer.appendLine(json.encodeToString(PrintSnapshotRecord.serializer(), record))
                    selectedCount++
                    maxTerm = max(maxTerm, client.loanTermDays)
                    if (request.kind == "summary") {
                        val amount = payments.fold(BigDecimal.ZERO) { s, payment -> s + BigDecimal.valueOf(payment.amount) }
                        total += amount
                        if (amount.signum() > 0) withCollections++
                    } else if (request.kind == "index") {
                        val capacity = ceil(client.loanTermDays / 4.0).toInt() * 4
                        physicalPages += ceil(max(client.loanTermDays, engine.indexPayments(client, payments).size).toDouble() / capacity).toInt()
                    } else physicalPages++
                }
                if (!request.selection.hasQuerySelection && request.selection.explicitIds.size <= 100) {
                    val selected = mutableListOf<Client>()
                    request.selection.explicitIds.sorted().forEach { id ->
                        val client = if (requireFresh) repository.getClient(id) else runCatching { repository.getClient(id) }.getOrElse { error -> repository.observeClient(id).first()?.also { cached = true } ?: throw error }
                        client?.let { selected.add(it) }
                    }
                    selected.sortedBy(engine::summaryName).forEach { append(it) }
                } else {
                    var page = 0
                    do {
                        val result = repository.clientsPage(ListQuery(page = page, pageSize = 100, sort = "name"))
                        cached = cached || !result.fresh
                        result.items.forEach { append(it) }
                        page++
                    } while (result.hasMore)
                }
            }
            require(!requireFresh || !cached) { "Connect and refresh financial data before exporting documents." }
            val intermediate = PrintSnapshot(file, selectedCount, availableCount, total.toDouble(), withCollections, maxTerm, cached)
            val positions = if (request.kind == "summary") groups(intermediate, request).count() else selectedCount
            return intermediate.copy(positions = positions, pages = if (request.kind == "summary") positions else physicalPages)
        } catch (error: Throwable) { file.delete(); throw error }
    }

    private suspend fun payments(client: Client, request: DocumentRequest): Pair<List<Payment>, Boolean> {
        if (request.kind == "promissory") return emptyList<Payment>() to false
        val amounts = sortedMapOf<String, BigDecimal>()
        val collectors = mutableMapOf<String, LinkedHashSet<String>>()
        val notes = mutableMapOf<String, LinkedHashSet<String>>()
        val transactions = mutableMapOf<String, LinkedHashSet<String>>()
        var cached = false
        var page = 0
        do {
            val result = repository.paymentsPage(clientId = client.id, loanId = if (request.kind == "index") client.activeLoanId.ifBlank { "initial" } else null,
                date = if (request.kind == "summary") request.date else null, page = page, pageSize = 100)
            cached = cached || !result.fresh
            result.items.forEach { receipt ->
                if (request.kind == "index" && (!receipt.amount.isFinite() || receipt.amount <= 0 || !com.mcl.mcllendingapp.domain.model.LoanMath.validDate(receipt.paymentDate))) return@forEach
                val date = receipt.paymentDate
                amounts[date] = amounts.getOrDefault(date, BigDecimal.ZERO) + BigDecimal.valueOf(receipt.amount)
                collectors.getOrPut(date) { linkedSetOf() }.add(receipt.collectorName.ifBlank { "Unknown collector" })
                notes.getOrPut(date) { linkedSetOf() }.add(receipt.notes.trim().ifBlank { request.settings.general.defaultPaymentNote })
                transactions.getOrPut(date) { linkedSetOf() }.add(if (receipt.loanId.isNotBlank() && receipt.loanId != "initial") receipt.loanId else client.originalTransactionNumber.ifBlank { client.transactionNumber }.ifBlank { "Pending" })
            }
            page++
        } while (result.hasMore)
        return amounts.map { (date, amount) -> Payment(id = "print-" + date, clientId = client.id,
            loanId = if (request.kind == "index") client.activeLoanId.ifBlank { "initial" } else transactions[date].orEmpty().joinToString("; "),
            paymentDate = date, amount = amount.toDouble(), collectorName = collectors[date].orEmpty().joinToString("; "), notes = notes[date].orEmpty().joinToString("; ")) } to cached
    }

    private fun records(snapshot: PrintSnapshot): Sequence<PrintSnapshotRecord> = sequence {
        snapshot.file.bufferedReader().use { reader ->
            var line = reader.readLine()
            while (line != null) {
                yield(json.decodeFromString(PrintSnapshotRecord.serializer(), line))
                line = reader.readLine()
            }
        }
    }

    private fun groups(snapshot: PrintSnapshot, request: DocumentRequest): Sequence<List<PrintSnapshotRecord>> = sequence {
        if (request.kind != "summary") {
            records(snapshot).forEach { yield(listOf(it)) }
        } else {
            val size = engine.dimensions(request.layout, PrintDocumentKind.SUMMARY)
            val usable = size.second - request.layout.marginMm * 2 - 40
            val buffer = mutableListOf<PrintSnapshotRecord>()
            var used = 0.0
            records(snapshot).forEach { record ->
                val cost = rowHeight(record, request, size.first)
                if (buffer.isNotEmpty() && used + cost > usable) { yield(buffer.toList()); buffer.clear(); used = 0.0 }
                buffer.add(record); used += cost
            }
            if (buffer.isNotEmpty()) yield(buffer.toList())
        }
    }

    private fun rowHeight(record: PrintSnapshotRecord, request: DocumentRequest, width: Double): Double {
        val receipt = record.payments.firstOrNull()
        val usableWidth = width - request.layout.marginMm * 2
        val transaction = receipt?.loanId?.takeIf { it.isNotBlank() && it != "initial" }
            ?: record.client.transactionNumber.ifBlank { "Pending" }
        val columns = listOf(transaction to .07, engine.publicId(record.client) to .09,
            engine.summaryName(record.client) to .19, engine.formatDate(request.date) to .10,
            receipt?.collectorName.orEmpty() to .15, receipt?.notes.orEmpty() to .28)
        val lines = columns.maxOf { (text, fraction) -> ceil(text.length / max(1.0, (usableWidth * fraction - 3) / (request.layout.fontSize * .19))) }.coerceAtLeast(1.0)
        return max(8.0, lines * request.layout.fontSize * .43 + 3)
    }

    private fun job(request: DocumentRequest, snapshot: PrintSnapshot, records: List<PrintSnapshotRecord>, position: Int, startIndex: Int = 0): PrintJob {
        val kind = PrintDocumentKind.entries.first { it.key == request.kind }
        val size = engine.dimensions(request.layout, kind, snapshot.maxTermDays)
        return PrintJob(kind, records.map { it.client }, records.flatMap { it.payments }, request.settings,
            request.layout.copy(paper = "custom", widthMm = size.first, heightMm = size.second), request.date, snapshot.availableCount,
            snapshot.selectedCount, snapshot.total, snapshot.withCollections, if (request.kind == "summary") position + 1 else null,
            if (request.kind == "summary") snapshot.positions else null, startIndex,
            request.kind != "summary" || position == snapshot.positions - 1)
    }

    private suspend fun writeHtml(request: DocumentRequest, snapshot: PrintSnapshot, output: OutputStream) {
        val writer = output.writer(Charsets.UTF_8)
        var opened = false
        var startIndex = 0
        groups(snapshot, request).forEachIndexed { position, group ->
            currentCoroutineContext().ensureActive()
            val document = engine.render(job(request, snapshot, group, position, startIndex)).html
            startIndex += group.size
            if (!opened) { writer.write(document.substringBefore("<body>")); writer.write("<body>"); opened = true }
            writer.write(document.substringAfter("<body>").substringBeforeLast("</body>"))
        }
        writer.write("</body></html>")
        writer.flush()
    }

    private fun writeBorrower(request: DocumentRequest, snapshot: PrintSnapshot, record: PrintSnapshotRecord, output: OutputStream) {
        val job = job(request, snapshot, listOf(record), 0)
        if (request.kind == "promissory") notes.write(job, record.client, output)
        else WordDocumentWriter(output, job, engine, logo()).apply { append(record.client, record.payments); finish() }
    }

    private fun logo() = context.assets.open("documents/logo.png").use { it.readBytes() }
    private fun filename(value: String) = value.replace(Regex("[^a-zA-Z0-9_-]"), "_").take(100)
}
