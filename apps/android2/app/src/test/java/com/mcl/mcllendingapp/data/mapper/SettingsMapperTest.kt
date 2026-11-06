package com.mcl.mcllendingapp.data.mapper

import com.mcl.mcllendingapp.domain.model.AppSettings
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class SettingsMapperTest {
    private val json = Json { encodeDefaults = true }
    private val summary = """{"paper":"a4","orientation":"landscape","widthMm":297,"heightMm":210,"marginMm":10,"fontSize":10}"""
    private val timestamp = """{"__mcl_type":"timestamp","seconds":1793850000,"nanos":123000000}"""

    @Test fun studioMetadataIsNotDecodedAsAPrintLayout() {
        val settings = SettingsMapper.readSettings(json, mapOf("studio" to
            """{"summary":$summary,"updatedBy":"fixture-administrator-uid","updatedAt":$timestamp,"revision":4,"deleted":null,"futureDocument":["a","b"]}"""))

        assertEquals(297.0, settings.studio.getValue("summary").widthMm, 0.0)
        assertEquals(10.0, settings.studio.getValue("summary").fontSize, 0.0)
        assertEquals(AppSettings().studio.getValue("index"), settings.studio.getValue("index"))
        assertEquals(AppSettings().studio.keys, settings.studio.keys)
    }

    @Test fun metadataOnlyStudioDocumentKeepsDefaultLayouts() {
        val settings = SettingsMapper.readSettings(json, mapOf("studio" to
            """{"updatedBy":"administrator","updatedAt":$timestamp}"""))
        assertEquals(AppSettings().studio, settings.studio)
    }

    @Test fun documentAndNestedMetadataDoNotChangeSettingsRevision() {
        val clean = mapOf(
            "general" to """{"businessName":"Field Office"}""",
            "payments" to """{"enforceDailyMinimum":true}""",
            "studio" to """{"summary":$summary}""")
        val withMetadata = clean + mapOf(
            "general" to """{"businessName":"Field Office","updatedBy":"administrator","updatedAt":$timestamp}""",
            "payments" to """{"enforceDailyMinimum":true,"updatedBy":"administrator","updatedAt":$timestamp}""",
            "index" to """{"updatedBy":"administrator","updatedAt":$timestamp}""",
            "promissory" to """{"updatedBy":"administrator","updatedAt":$timestamp}""",
            "trash" to """{"updatedBy":"administrator","updatedAt":$timestamp}""",
            "studio" to """{"summary":${summary.dropLast(1)},"updatedBy":"administrator","updatedAt":$timestamp},"updatedBy":"administrator","updatedAt":$timestamp}""")
        assertEquals(SettingsMapper.readSettings(json, clean), SettingsMapper.readSettings(json, withMetadata))
    }

    @Test fun malformedSupportedLayoutIsRejectedInsteadOfSilentlyDefaulted() {
        assertThrows(SerializationException::class.java) {
            SettingsMapper.readSettings(json, mapOf("studio" to """{"summary":"not-a-layout","updatedBy":"administrator"}"""))
        }
    }

    @Test fun supportedLayoutStillRequiresValidPhysicalDimensions() {
        assertThrows(IllegalArgumentException::class.java) {
            SettingsMapper.readSettings(json, mapOf("studio" to """{"summary":{"widthMm":-1},"updatedBy":"administrator"}"""))
        }
    }
}
