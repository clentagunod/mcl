package com.mcl.mcllendingapp.data.mapper

import android.util.Base64
import com.google.firebase.Timestamp
import com.google.firebase.firestore.Blob
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.GeoPoint
import kotlinx.serialization.json.*

object FirestoreCodec {
    fun encode(values: Map<String, Any?>): String = objectValue(values).toString()
    fun decode(value: String, db: FirebaseFirestore): Map<String, Any?> =
        Json.parseToJsonElement(value).jsonObject.mapValues { (_, element) -> restore(element, db) }

    private fun objectValue(values: Map<*, *>): JsonObject =
        JsonObject(values.entries.associate { it.key.toString() to element(it.value) })

    private fun element(value: Any?): JsonElement = when (value) {
        null -> JsonNull
        is Timestamp -> buildJsonObject {
            put("__mcl_type", "timestamp"); put("seconds", value.seconds); put("nanos", value.nanoseconds)
        }
        is GeoPoint -> buildJsonObject {
            put("__mcl_type", "geo"); put("latitude", value.latitude); put("longitude", value.longitude)
        }
        is Blob -> buildJsonObject {
            put("__mcl_type", "blob"); put("value", Base64.encodeToString(value.toBytes(), Base64.NO_WRAP))
        }
        is DocumentReference -> buildJsonObject { put("__mcl_type", "ref"); put("path", value.path) }
        is Map<*, *> -> objectValue(value)
        is List<*> -> JsonArray(value.map(::element))
        is Boolean -> JsonPrimitive(value)
        is Number -> JsonPrimitive(value)
        is String -> JsonPrimitive(value)
        else -> error("Unsupported Firestore field type ${value::class.simpleName}. Nothing was discarded.")
    }

    private fun restore(value: JsonElement, db: FirebaseFirestore): Any? = when (value) {
        JsonNull -> null
        is JsonArray -> value.map { restore(it, db) }
        is JsonObject -> when (value["__mcl_type"]?.jsonPrimitive?.content) {
            "timestamp" -> Timestamp(value.getValue("seconds").jsonPrimitive.long, value.getValue("nanos").jsonPrimitive.int)
            "geo" -> GeoPoint(value.getValue("latitude").jsonPrimitive.double, value.getValue("longitude").jsonPrimitive.double)
            "blob" -> Blob.fromBytes(Base64.decode(value.getValue("value").jsonPrimitive.content, Base64.NO_WRAP))
            "ref" -> db.document(value.getValue("path").jsonPrimitive.content)
            else -> value.mapValues { (_, child) -> restore(child, db) }
        }
        is JsonPrimitive -> if (value.isString) value.content else
            value.booleanOrNull ?: value.longOrNull ?: value.doubleOrNull ?: error("Invalid cached field.")
    }
}
