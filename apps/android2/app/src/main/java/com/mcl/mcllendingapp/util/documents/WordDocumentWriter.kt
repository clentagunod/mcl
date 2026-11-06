package com.mcl.mcllendingapp.util.documents

import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.Payment
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.math.ceil
import kotlin.math.roundToInt

class WordDocumentWriter(
    output: OutputStream,
    private val job: PrintJob,
    private val engine: PrintDocumentEngine,
    private val logo: ByteArray
) {
    private val archive = ZipOutputStream(output)
    private val width = (engine.dimensions(job.layout, job.kind).first / 25.4 * 1440).roundToInt()
    private val height = (engine.dimensions(job.layout, job.kind).second / 25.4 * 1440).roundToInt()
    private val margin = (job.layout.marginMm / 25.4 * 1440).roundToInt()
    private val font = (job.layout.fontSize * 2).roundToInt()
    private val writer: OutputStreamWriter
    private var rowNumber = 0

    init {
        archive.putNextEntry(ZipEntry("word/document.xml"))
        writer = OutputStreamWriter(archive, Charsets.UTF_8)
        writer.write("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\" xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><w:body>")
        if (job.kind == PrintDocumentKind.SUMMARY) {
            writer.write(logoParagraph())
            writer.write(paragraph("DAILY SUMMARY SHEET", true))
            writer.write(paragraph(job.settings.index.businessName + " · " + job.settings.index.branch))
            writer.write(paragraph(engine.formatDate(job.date)))
            writer.write(paragraph(if (job.selectedClientCount != null && job.selectedClientCount < job.totalClients) job.selectedClientCount.toString() + " of " + job.totalClients + " clients selected" else "All clients"))
            openTable(listOf(3, 7, 9, 19, 9, 10, 15, 28))
            row(listOf("Index", "Transaction number", "Client ID", "Client Name [Last–First–Middle]", "Amount", "Date", "Collected by", "Notes"), true, repeatHeader = true)
        }
    }

    fun append(client: Client, payments: List<Payment>) {
        if (job.kind == PrintDocumentKind.SUMMARY) {
            val receipts = payments.filter { it.clientId == client.id && it.paymentDate == job.date }
            val transactions = if (receipts.isEmpty()) client.transactionNumber.ifBlank { "Pending" } else receipts.map { if (it.loanId.isNotBlank() && it.loanId != "initial") it.loanId else client.originalTransactionNumber.ifBlank { client.transactionNumber }.ifBlank { "Pending" } }.distinct().joinToString("; ")
            row(listOf(
                (++rowNumber).toString(), transactions, engine.publicId(client), engine.summaryName(client),
                engine.money(receipts.sumOf { it.amount }), engine.formatDate(job.date),
                receipts.map { it.collectorName.ifBlank { "Unknown collector" } }.distinct().joinToString("; ").ifBlank { "—" },
                receipts.map { it.notes.trim().ifBlank { job.settings.general.defaultPaymentNote } }.distinct().joinToString("; ").ifBlank { "—" }
            ))
        } else {
            val entries = engine.indexPayments(client, payments)
            val rows = ceil(client.loanTermDays / 4.0).toInt()
            val capacity = rows * 4
            val count = maxOf(client.loanTermDays, entries.size)
            repeat(ceil(count.toDouble() / capacity).toInt()) { page ->
                if (page > 0 || rowNumber++ > 0) writer.write("<w:p><w:r><w:br w:type=\"page\"/></w:r></w:p>")
                writer.write(logoParagraph())
                writer.write(paragraph(job.settings.index.businessName.uppercase(), true, job.settings.index.headingColor))
                writer.write(paragraph(job.settings.index.branch))
                writer.write(paragraph("BORROWER’S COPY · MOBILE #: " + job.settings.index.mobile, true))
                writer.write(paragraph("Name: " + engine.fullName(client) + "     Date: " + engine.formatDate(client.approvalDate), true))
                writer.write(paragraph("Address: " + client.address, true))
                val amount = if (job.settings.index.amountBasis == "principal") client.principal else client.principal + client.interest
                writer.write(paragraph("Amount: " + engine.money(amount) + "     No. of Days: " + client.loanTermDays + "     Daily: " + engine.money(engine.daily(client)), true))
                writer.write(paragraph(engine.publicId(client) + " · Transaction " + client.transactionNumber.ifBlank { "Pending" }))
                openTable(listOf(25, 25, 25, 25))
                repeat(rows) { rowIndex ->
                    row((0 until 4).map { column ->
                        val day = page * capacity + column * rows + rowIndex + 1
                        val entry = entries.getOrNull(day - 1)
                        if (day > count) "" else day.toString() + ".  " + (entry?.let { engine.money(it.second) + "  " + engine.formatDate(it.first) } ?: "") + "  _____"
                    }, fill = job.settings.index.cellColor)
                }
                writer.write("</w:tbl><w:p/>")
            }
        }
    }

    fun finish(grandTotal: Double = 0.0, selectedCount: Int = 0, withCollections: Int = 0) {
        if (job.kind == PrintDocumentKind.SUMMARY) {
            row(listOf("", "", "", "Grand total (PHP)", engine.money(grandTotal), "", selectedCount.toString() + " clients", withCollections.toString() + " with collections"), true)
            writer.write("</w:tbl>")
            writer.write(paragraph("Prepared by: ________________________       Checked by: ________________________"))
        }
        writer.write("<w:sectPr><w:pgSz w:w=\"$width\" w:h=\"$height\" w:orient=\"" + job.layout.orientation +
            "\"/><w:pgMar w:top=\"$margin\" w:right=\"$margin\" w:bottom=\"$margin\" w:left=\"$margin\" w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>")
        writer.flush()
        archive.closeEntry()
        entry("[Content_Types].xml", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Default Extension=\"png\" ContentType=\"image/png\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")
        entry("_rels/.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>")
        entry("word/_rels/document.xml.rels", "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rIdMclLogo\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\" Target=\"media/mcl-logo.png\"/></Relationships>")
        archive.putNextEntry(ZipEntry("word/media/mcl-logo.png"))
        archive.write(logo)
        archive.closeEntry()
        archive.finish()
        archive.flush()
    }

    private fun entry(name: String, xml: String) {
        archive.putNextEntry(ZipEntry(name))
        archive.write(xml.toByteArray(Charsets.UTF_8))
        archive.closeEntry()
    }

    private fun paragraph(text: String, bold: Boolean = false, fill: String? = null, small: Boolean = false): String =
        "<w:p><w:pPr><w:spacing w:before=\"0\" w:after=\"0\"/>" +
            (fill?.let { "<w:shd w:fill=\"" + it.removePrefix("#") + "\"/>" } ?: "") +
            "</w:pPr><w:r><w:rPr><w:rFonts w:ascii=\"" + (if (job.kind == PrintDocumentKind.INDEX) "Aptos Narrow" else "Calibri") +
            "\" w:hAnsi=\"" + (if (job.kind == PrintDocumentKind.INDEX) "Aptos Narrow" else "Calibri") +
            "\"/><w:sz w:val=\"" + (if (small) (font * .825).roundToInt() else font) + "\"/>" + (if (bold) "<w:b/>" else "") +
            "</w:rPr><w:t xml:space=\"preserve\">" + engine.escape(text) + "</w:t></w:r></w:p>"

    private fun openTable(widths: List<Int>) {
        writer.write("<w:tbl><w:tblPr><w:tblW w:w=\"5000\" w:type=\"pct\"/><w:tblBorders><w:top w:val=\"single\" w:sz=\"4\"/><w:left w:val=\"single\" w:sz=\"4\"/><w:bottom w:val=\"single\" w:sz=\"4\"/><w:right w:val=\"single\" w:sz=\"4\"/><w:insideH w:val=\"single\" w:sz=\"4\"/><w:insideV w:val=\"single\" w:sz=\"4\"/></w:tblBorders></w:tblPr><w:tblGrid>")
        widths.forEach { writer.write("<w:gridCol w:w=\"" + ((width - margin * 2) * it / 100) + "\"/>") }
        writer.write("</w:tblGrid>")
    }

    private fun row(cells: List<String>, heading: Boolean = false, fill: String? = null, repeatHeader: Boolean = false) {
        writer.write("<w:tr><w:trPr><w:cantSplit/>" + (if (repeatHeader) "<w:tblHeader/>" else "") + "</w:trPr>")
        cells.forEach { cell ->
            writer.write("<w:tc><w:tcPr>" + ((fill ?: if (heading) "#e5ecf3" else null)?.let { "<w:shd w:fill=\"" + it.removePrefix("#") + "\"/>" } ?: "") +
                "</w:tcPr>" + paragraph(cell, heading, small = true) + "</w:tc>")
        }
        writer.write("</w:tr>")
    }

    private fun logoParagraph() = "<w:p>" + DocxLogoMarkup.run + "</w:p>"
}
