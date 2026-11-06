package com.mcl.mcllendingapp.util.documents

import android.content.Context
import android.util.Base64
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.Payment
import com.mcl.mcllendingapp.domain.model.PrintLayout
import com.mcl.mcllendingapp.domain.model.LoanMath
import com.mcl.mcllendingapp.domain.usecase.printables.BuildIndexPaymentDaysUseCase
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlin.math.ceil
import kotlin.math.max

class PrintDocumentEngine @Inject constructor(
    @ApplicationContext private val context: Context,
    private val indexDays: BuildIndexPaymentDaysUseCase
) {
    private val locale = Locale.forLanguageTag("en-PH")
    private val dateFormat = DateTimeFormatter.ofPattern("MMM d, yyyy", locale)
    private val logo by lazy {
        "data:image/png;base64," + Base64.encodeToString(context.assets.open("documents/logo.png").use { it.readBytes() }, Base64.NO_WRAP)
    }

    fun dimensions(layout: PrintLayout, kind: PrintDocumentKind, days: Int = 45): Pair<Double, Double> {
        val base = when (layout.paper) {
            "a4" -> 210.0 to 297.0
            "letter" -> 215.9 to 279.4
            "legal" -> 215.9 to 355.6
            "custom" -> layout.widthMm to layout.heightMm
            else -> when (kind) {
                PrintDocumentKind.INDEX -> 238.0 to (122.0 + max(0.0, ceil(days / 4.0) - 12) * 5.08)
                PrintDocumentKind.PROMISSORY -> 210.0 to 297.0
                PrintDocumentKind.SUMMARY -> 297.0 to 210.0
            }
        }
        val small = minOf(base.first, base.second)
        val large = maxOf(base.first, base.second)
        return if (layout.orientation == "landscape") large to small else small to large
    }

    fun render(job: PrintJob): PrintableOutput {
        require(valid(job.layout)) { "Paper dimensions must be 70–600 mm, margins 0–30 mm and font size 6–18 pt." }
        require(listOf(job.settings.index.headingColor, job.settings.index.cellColor).all { Regex("^#[0-9a-fA-F]{6}$").matches(it) }) { "Choose valid six-digit template colors in Settings." }
        val size = dimensions(job.layout, job.kind, job.clients.maxOfOrNull { it.loanTermDays } ?: 45)
        val pages = when (job.kind) {
            PrintDocumentKind.INDEX -> job.clients.flatMap { indexCards(job, it) }
            PrintDocumentKind.PROMISSORY -> job.clients.map { note(job, it) }
            PrintDocumentKind.SUMMARY -> summaries(job)
        }
        val style = context.assets.open("documents/print.css").bufferedReader().use { it.readText() }
        val variables = ":root{--page-width:" + size.first + "mm;--page-height:" + size.second +
            "mm;--page-margin:" + job.layout.marginMm + "mm;--print-font:" + job.layout.fontSize +
            "pt;--heading-accent:" + job.settings.index.headingColor + ";--cell-accent:" + job.settings.index.cellColor +
            "}@page{size:" + size.first + "mm " + size.second + "mm;margin:0}"
        val html = "<!doctype html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>" +
            escape(job.kind.title) + " – " + escape(job.date) + "</title><style>" + style + variables +
            "</style></head><body>" + pages.joinToString("") + "</body></html>"
        return PrintableOutput(html, pages.size, size.first, size.second)
    }

    fun valid(layout: PrintLayout): Boolean = layout.paper in listOf("template", "a4", "letter", "legal", "custom") &&
        layout.orientation in listOf("portrait", "landscape") &&
        listOf(layout.widthMm, layout.heightMm).all { it.isFinite() && it in 70.0..600.0 } &&
        layout.marginMm.isFinite() && layout.marginMm in 0.0..30.0 &&
        layout.fontSize.isFinite() && layout.fontSize in 6.0..18.0 && layout.fontSize * 2 % 1 == 0.0

    fun fullName(client: Client) = listOf(client.firstName, client.middleName, client.lastName).filter { it.isNotBlank() }.joinToString(" ")
    fun summaryName(client: Client) = client.lastName + ", " + listOf(client.firstName, client.middleName).filter { it.isNotBlank() }.joinToString(" ")
    fun publicId(client: Client) = client.clientNumber.ifBlank { client.id }
    fun money(value: Double) = String.format(locale, "%,.2f", value)
    fun formatDate(date: String) = runCatching { LocalDate.parse(date).format(dateFormat) }.getOrDefault(date)
    fun escape(value: String): String = value.filter { it >= ' ' && it != '\uFFFE' && it != '\uFFFF' || it == '\n' || it == '\r' || it == '\t' }.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
    fun daily(client: Client) = LoanMath.dailyPayable(client)

    fun indexPayments(client: Client, payments: List<Payment>): List<Pair<String, Double>> = indexDays(client, payments)

    fun noteValues(job: PrintJob, client: Client): Map<String, String> {
        val date = LocalDate.parse(client.approvalDate)
        val day = date.dayOfMonth
        val ordinal = if (day % 100 in 11..13) "th" else when (day % 10) { 1 -> "st"; 2 -> "nd"; 3 -> "rd"; else -> "th" }
        return mapOf(
            "principal" to money(client.principal), "approvalDate" to date.format(DateTimeFormatter.ofPattern("MMMM d, yyyy", locale)),
            "borrower" to fullName(client).uppercase(locale), "address" to client.address.uppercase(locale),
            "payee" to job.settings.promissory.payee, "amountWords" to pesoWords(client.principal + client.interest),
            "total" to money(client.principal + client.interest), "term" to client.loanTermDays.toString(),
            "interestStatement" to job.settings.promissory.interestStatement, "dailyAmount" to money(daily(client)),
            "day" to day.toString(), "ordinal" to ordinal, "monthYear" to date.format(DateTimeFormatter.ofPattern("MMMM, yyyy", locale)),
            "executionPlace" to job.settings.promissory.executionPlace, "cellphone" to client.cellphone,
            "clientNumber" to publicId(client), "transactionNumber" to client.transactionNumber.ifBlank { "Pending" }
        )
    }

    private fun note(job: PrintJob, client: Client): String {
        val values = noteValues(job, client)
        val template = context.assets.open("documents/promissory.html").bufferedReader().use { it.readText() }
        val content = Regex("\\{\\{(\\w+)}}").replace(template) { escape(values[it.groupValues[1]].orEmpty()) }
        return "<section class=\"sheet promissory-sheet\"><div class=\"sheet-body\"><div class=\"note-brand\"><img src=\"" + logo +
            "\" alt=\"MCL Lending logo\"><span>" + escape(publicId(client)) + " · Transaction " +
            escape(client.transactionNumber.ifBlank { "Pending" }) + "</span></div>" + content + "</div></section>"
    }

    private fun indexCards(job: PrintJob, client: Client): List<String> {
        val entries = indexPayments(client, job.payments)
        val count = max(client.loanTermDays, entries.size)
        val rows = ceil(client.loanTermDays / 4.0).toInt()
        val capacity = rows * 4
        return (0 until ceil(count.toDouble() / capacity).toInt()).map { page ->
            val from = page * capacity + 1
            val to = minOf(count, (page + 1) * capacity)
            val grid = (0 until rows).joinToString("") { row ->
                "<tr>" + (0 until 4).joinToString("") { col ->
                    val day = from + col * rows + row
                    val entry = entries.getOrNull(day - 1)
                    if (day > to) "<td class=\"unused-cell\"></td>"
                    else "<td><div class=\"index-entry\"><b>$day.</b><span>" + (entry?.let { money(it.second) } ?: "") +
                        "</span><span>" + (entry?.let { escape(formatDate(it.first)) } ?: "") +
                        "</span><span class=\"signature-line\" aria-label=\"Signature blank\"></span></div></td>"
                } + "</tr>"
            }
            val brand = job.settings.index
            val amount = if (brand.amountBasis == "principal") client.principal else client.principal + client.interest
            "<section class=\"sheet index-sheet\"><div class=\"sheet-body\"><header class=\"index-heading\"><img src=\"" + logo +
                "\" alt=\"MCL Lending logo\"><h1>" + escape(brand.businessName.uppercase(locale)) +
                "</h1></header><div class=\"index-subheading\"><i>" + escape(brand.branch) +
                "</i><strong>BORROWER’S COPY</strong><strong>MOBILE #: " + escape(brand.mobile) +
                "</strong></div><div class=\"index-details\"><div>Name: <b>" + escape(fullName(client)) +
                "</b></div><div>Date: <b>" + escape(formatDate(client.approvalDate)) +
                "</b></div><div>Address: <b>" + escape(client.address) + "</b></div><div>Amount: <b>" + money(amount) +
                "</b></div><div>No. of Days: <b>" + client.loanTermDays + "</b></div><div>Daily: <b>" +
                money(daily(client)) + "</b></div></div><div class=\"index-reference\">" + escape(publicId(client)) +
                " · Transaction " + escape(client.transactionNumber.ifBlank { "Pending" }) +
                (if (count > capacity) " · Card " + (page + 1) + "/" + ceil(count.toDouble() / capacity).toInt() else "") +
                "</div><table class=\"index-grid\"><tbody>" + grid + "</tbody></table></div></section>"
        }
    }

    private fun summaries(job: PrintJob): List<String> {
        val size = dimensions(job.layout, job.kind)
        val rowHeight = max(8.0, job.layout.fontSize * 0.8)
        val capacity = max(1, ((size.second - 2 * job.layout.marginMm - 40) / rowHeight).toInt())
        val clients = job.clients.sortedBy { summaryName(it) }
        val chunks = if (job.summaryPageNumber != null) listOf(clients) else clients.chunked(capacity).ifEmpty { listOf(emptyList()) }
        val receipts = job.payments.filter { it.paymentDate == job.date }.groupBy { it.clientId }
        val total = clients.fold(BigDecimal.ZERO) { sum, client -> sum + (receipts[client.id].orEmpty().fold(BigDecimal.ZERO) { s, p -> s + BigDecimal.valueOf(p.amount) }) }
        var index = job.startIndex
        return chunks.mapIndexed { page, group ->
            val rows = group.joinToString("") { client ->
                val payments = receipts[client.id].orEmpty()
                val amount = payments.fold(BigDecimal.ZERO) { s, p -> s + BigDecimal.valueOf(p.amount) }.toDouble()
                val transactions = if (payments.isEmpty()) client.transactionNumber.ifBlank { "Pending" } else payments.map { if (it.loanId.isNotBlank() && it.loanId != "initial") it.loanId else client.originalTransactionNumber.ifBlank { client.transactionNumber }.ifBlank { "Pending" } }.distinct().joinToString("; ")
                val notes = payments.map { it.notes.trim().ifBlank { job.settings.general.defaultPaymentNote } }.distinct().joinToString("; ").ifBlank { "—" }
                val collectors = payments.map { it.collectorName.ifBlank { "Unknown collector" } }.distinct().joinToString("; ").ifBlank { "—" }
                "<tr><td>" + (++index) + "</td><td>" + escape(transactions) + "</td><td>" + escape(publicId(client)) +
                    "</td><td>" + escape(summaryName(client)) + "</td><td class=\"num\">" + money(amount) +
                    "</td><td>" + escape(formatDate(job.date)) + "</td><td>" + escape(collectors) + "</td><td>" + escape(notes) + "</td></tr>"
            }
            "<section class=\"sheet summary-sheet\"><div class=\"sheet-body\"><header class=\"summary-heading\"><img src=\"" +
                logo + "\" alt=\"MCL Lending logo\"><div><h1>DAILY SUMMARY SHEET</h1><p>" +
                escape(job.settings.index.businessName + " · " + job.settings.index.branch) +
                "</p><p class=\"summary-scope\">" + (if ((job.selectedClientCount ?: job.clients.size) < job.totalClients) (job.selectedClientCount ?: job.clients.size).toString() + " of " + job.totalClients + " clients selected" else "All clients") +
                "</p></div><div class=\"summary-meta\"><b>" + escape(formatDate(job.date)) + "</b><br>Page " +
                (job.summaryPageNumber ?: (page + 1)) + " of " + (job.summaryPageCount ?: chunks.size) + "</div></header><table class=\"summary-table\"><colgroup>" +
                listOf(3,7,9,19,9,10,15,28).joinToString("") { "<col style=\"width:$it%\">" } +
                "</colgroup><thead><tr>" + listOf("Index","Transaction number","Client ID","Client Name [Last–First–Middle]","Amount","Date","Collected by","Notes").joinToString("") { "<th>" + escape(it) + "</th>" } +
                "</tr></thead><tbody>" + rows + "</tbody>" +
                (if (page == chunks.lastIndex && job.includeGrandTotal) "<tfoot><tr><th colspan=\"4\">Grand total (PHP)</th><td class=\"num\"><strong>" +
                    money(job.grandTotal ?: total.toDouble()) + "</strong></td><td colspan=\"3\">" + (job.selectedClientCount ?: clients.size) + " clients · " +
                    (job.clientsWithCollections ?: clients.count { receipts[it.id].orEmpty().isNotEmpty() }) + " with collections</td></tr></tfoot>" else "") +
                "</table><footer class=\"summary-footer\">Prepared by: ________________________ <span>Checked by: ________________________</span></footer></div></section>"
        }
    }

    private fun pesoWords(value: Double): String {
        val cents = BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact()
        require(cents >= 0) { "Amount is outside the supported printable range." }
        val whole = cents / 100
        val fraction = cents % 100
        return (words(whole) + (if (whole == 1L) " peso" else " pesos") +
            if (fraction > 0) " and " + words(fraction) + if (fraction == 1L) " centavo" else " centavos" else "").uppercase(locale)
    }

    private fun words(value: Long): String {
        val small = listOf("zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen")
        val tens = listOf("","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety")
        if (value < 20) return small[value.toInt()]
        if (value < 100) return tens[(value / 10).toInt()] + if (value % 10 > 0) " " + words(value % 10) else ""
        for ((scale, label) in listOf(1_000_000_000_000L to "trillion",1_000_000_000L to "billion",1_000_000L to "million",1000L to "thousand",100L to "hundred")) {
            if (value >= scale) return words(value / scale) + " " + label + if (value % scale > 0) " " + words(value % scale) else ""
        }
        return ""
    }
}
