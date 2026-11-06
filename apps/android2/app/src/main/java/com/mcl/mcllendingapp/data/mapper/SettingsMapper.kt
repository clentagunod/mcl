package com.mcl.mcllendingapp.data.mapper

import com.google.firebase.firestore.FirebaseFirestore
import com.mcl.mcllendingapp.domain.model.*
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import java.security.MessageDigest
import javax.inject.Inject

class SettingsMapper @Inject constructor(private val json: Json, private val configuration: com.mcl.mcllendingapp.data.remote.FirebaseConfiguration) {
    private val db get()=configuration.db
    val paths = linkedMapOf(
        "general" to "settings/Configurations/elements/general",
        "payments" to "settings/Configurations/elements/paymentPolicy",
        "trash" to "settings/Configurations/elements/trashPolicy",
        "index" to "settings/Printables/elements/indexTemplate",
        "promissory" to "settings/Printables/elements/promissoryTemplate",
        "studio" to "settings/Printables/elements/studio")

    fun read(raw: Map<String, String>): AppSettings = readSettings(json, raw)

    companion object {
        internal fun readSettings(json: Json, raw: Map<String, String>): AppSettings {
            val decoder = Json(json) { ignoreUnknownKeys = true }
            val defaults = AppSettings()
            val settings = AppSettings(
                general = raw["general"]?.let { decoder.decodeFromString<GeneralSettings>(it) } ?: defaults.general,
                payments = raw["payments"]?.let { decoder.decodeFromString<PaymentSettings>(it) } ?: defaults.payments,
                trash = raw["trash"]?.let { decoder.decodeFromString<TrashSettings>(it) } ?: defaults.trash,
                index = raw["index"]?.let { decoder.decodeFromString<IndexSettings>(it) } ?: defaults.index,
                promissory = raw["promissory"]?.let { decoder.decodeFromString<PromissorySettings>(it) } ?: defaults.promissory,
                studio = raw["studio"]?.let { value ->
                    val incoming = decoder.parseToJsonElement(value).jsonObject
                    defaults.studio.mapValues { (key, fallback) ->
                        incoming[key]?.let { decoder.decodeFromJsonElement<PrintLayout>(it) } ?: fallback
                    }
                } ?: defaults.studio)
            SettingsValidation.validate(settings)
            val digest = MessageDigest.getInstance("SHA-256").digest(json.encodeToString(settings).toByteArray())
                .joinToString("") { "%02x".format(it) }
            return settings.copy(revision = digest)
        }
    }

    fun write(settings: AppSettings): Map<String, Map<String, Any?>> {
        SettingsValidation.validate(settings)
        val values = mapOf("general" to json.encodeToString(settings.general),
            "payments" to json.encodeToString(settings.payments), "trash" to json.encodeToString(settings.trash),
            "index" to json.encodeToString(settings.index), "promissory" to json.encodeToString(settings.promissory),
            "studio" to json.encodeToString(settings.studio))
        return values.mapValues { (_, value) -> FirestoreCodec.decode(value, db) }
    }
}
