package com.mcl.mcllendingapp.util.documents

import android.content.Context
import com.mcl.mcllendingapp.domain.model.Client
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.inject.Inject
import kotlin.math.roundToInt

class PromissoryDocxExporter @Inject constructor(
    @ApplicationContext private val context: Context,
    private val engine: PrintDocumentEngine
) {
    fun write(job: PrintJob, client: Client, output: OutputStream) {
        val values = engine.noteValues(job, client)
        val size = engine.dimensions(job.layout, PrintDocumentKind.PROMISSORY)
        val width = (size.first / 25.4 * 1440).roundToInt()
        val height = (size.second / 25.4 * 1440).roundToInt()
        val margin = (job.layout.marginMm / 25.4 * 1440).roundToInt()
        val font = (job.layout.fontSize * 2).roundToInt()
        val archive = ZipOutputStream(output)
        var imageWritten = false
        var relationsWritten = false
        ZipInputStream(context.assets.open("documents/promissory.docx")).use { original ->
            var entry = original.nextEntry
            while (entry != null) {
                val name = entry.name
                val bytes = original.readBytes()
                archive.putNextEntry(ZipEntry(name))
                if (name == "word/document.xml") {
                    var xml = bytes.toString(Charsets.UTF_8)
                    xml = Regex("\\{\\{(\\w+)}}").replace(xml) { engine.escape(values[it.groupValues[1]].orEmpty()) }
                    require(!Regex("\\{\\{\\w+}}").containsMatchIn(xml)) { "An unresolved note field was found." }
                    xml = Regex("<w:pgSz\\b[^>]*/>").replace(xml, "<w:pgSz w:w=\"$width\" w:h=\"$height\" w:orient=\"" + job.layout.orientation + "\"/>")
                    xml = Regex("<w:pgMar\\b[^>]*/>").replace(xml, "<w:pgMar w:top=\"$margin\" w:right=\"$margin\" w:bottom=\"$margin\" w:left=\"$margin\" w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/>")
                    xml = Regex("<(w:sz|w:szCs) w:val=\"24\"\\s*/>").replace(xml) { "<" + it.groupValues[1] + " w:val=\"$font\"/>" }
                    val availableWidth = width - 2 * margin
                    val indent = minOf(720, availableWidth / 4)
                    val columnWidth = (availableWidth - indent) / 2
                    xml = Regex("<w:tbl>.*?</w:tbl>", RegexOption.DOT_MATCHES_ALL).replace(xml) { table ->
                        if (!table.value.contains("Co-Maker Signature over Printed Name")) table.value else {
                            Regex("<w:tblW\\b[^>]*/>").replace(table.value, "<w:tblW w:w=\"" + (columnWidth * 2) + "\" w:type=\"dxa\"/>")
                                .let { Regex("<w:tblInd\\b[^>]*/>").replace(it, "<w:tblInd w:w=\"$indent\" w:type=\"dxa\"/>") }
                                .let { Regex("<w:gridCol\\b[^>]*/>").replace(it, "<w:gridCol w:w=\"$columnWidth\"/>") }
                                .let { Regex("<w:tcW\\b[^>]*/>").replace(it, "<w:tcW w:w=\"$columnWidth\" w:type=\"dxa\"/>") }
                        }
                    }
                    xml = Regex("(<w:body>\\s*<w:p\\b[^>]*>\\s*<w:pPr>.*?</w:pPr>)", RegexOption.DOT_MATCHES_ALL).replaceFirst(xml, "$1" + DocxLogoMarkup.run)
                    archive.write(xml.toByteArray(Charsets.UTF_8))
                } else if (name == "word/_rels/document.xml.rels") {
                    relationsWritten = true
                    archive.write(bytes.toString(Charsets.UTF_8).replace("</Relationships>", DocxLogoMarkup.relationship + "</Relationships>").toByteArray(Charsets.UTF_8))
                } else if (name == "[Content_Types].xml") {
                    val xml = bytes.toString(Charsets.UTF_8)
                    archive.write((if (xml.contains("Extension=\"png\"")) xml else xml.replace("</Types>", "<Default Extension=\"png\" ContentType=\"image/png\"/></Types>")).toByteArray(Charsets.UTF_8))
                } else if (name == "word/media/mcl-logo.png") {
                    imageWritten = true
                    context.assets.open("documents/logo.png").use { it.copyTo(archive) }
                } else archive.write(bytes)
                archive.closeEntry()
                original.closeEntry()
                entry = original.nextEntry
            }
        }
        if (!imageWritten) {
            archive.putNextEntry(ZipEntry("word/media/mcl-logo.png")); context.assets.open("documents/logo.png").use { it.copyTo(archive) }; archive.closeEntry()
        }
        if (!relationsWritten) {
            archive.putNextEntry(ZipEntry("word/_rels/document.xml.rels"))
            archive.write(("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" + DocxLogoMarkup.relationship + "</Relationships>").toByteArray(Charsets.UTF_8))
            archive.closeEntry()
        }
        archive.finish()
        archive.flush()
    }
}
