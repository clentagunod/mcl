package com.mcl.mcllendingapp.data.remote

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.MemoryCacheSettings
import dagger.hilt.android.qualifiers.ApplicationContext
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FirebaseConfiguration @Inject constructor(@ApplicationContext private val context: Context) {
    private val preferences=context.getSharedPreferences("firebase_public_configuration",Context.MODE_PRIVATE)
    @Volatile private var application: FirebaseApp?=FirebaseApp.getApps(context)
        .find { it.name==FirebaseApp.DEFAULT_APP_NAME } ?: FirebaseApp.initializeApp(context)
    private var database: FirebaseFirestore?=null
    val missingMessage="Firebase configuration is missing. Import google-services.json for com.mcl.mcllendingapp."
    val configured: Boolean get()=application!=null
    val auth: FirebaseAuth get()=FirebaseAuth.getInstance(application ?: error(missingMessage))
    val currentUid: String? get()=if(configured) auth.currentUser?.uid else null
    val db: FirebaseFirestore
        @Synchronized get() {
            database?.let { return it }
            return FirebaseFirestore.getInstance(application ?: error(missingMessage)).also {
                it.firestoreSettings=FirebaseFirestoreSettings.Builder()
                    .setLocalCacheSettings(MemoryCacheSettings.newBuilder().build()).build()
                database=it
            }
        }

    init {
        if(application==null) preferences.getString("google_services",null)?.let { saved ->
            runCatching { configure(saved) }
        }
    }

    @Synchronized
    fun configure(value: String) {
        require(value.length<=1_000_000) { "Configuration file is unexpectedly large." }
        val root=JSONObject(value)
        val project=root.getJSONObject("project_info")
        val clients=root.getJSONArray("client")
        val client=(0 until clients.length()).map { clients.getJSONObject(it) }.find {
            it.optJSONObject("client_info")?.optJSONObject("android_client_info")?.optString("package_name")==context.packageName
        } ?: error("This file has no Android client for ${context.packageName}. Download that app's google-services.json from Firebase.")
        val info=client.getJSONObject("client_info")
        val applicationId=info.getString("mobilesdk_app_id")
        val projectId=project.getString("project_id")
        val sender=project.getString("project_number")
        val keys=client.getJSONArray("api_key")
        val apiKey=(0 until keys.length()).map { keys.getJSONObject(it).optString("current_key") }.firstOrNull { it.isNotBlank() }
            ?: error("Configuration has no API key.")
        require(applicationId.startsWith("1:") && ":android:" in applicationId && projectId.isNotBlank() && sender.isNotBlank() && sender.all(Char::isDigit)) {
            "Invalid Android Firebase project information."
        }
        application?.let {
            require(it.options.projectId==projectId && it.options.applicationId==applicationId) {
                "This device already uses another Firebase project. Clear app storage to change projects after reconciling all reserved receipts."
            }
        }
        if(application==null) {
            val options=FirebaseOptions.Builder().setApplicationId(applicationId).setApiKey(apiKey)
                .setProjectId(projectId).setGcmSenderId(sender)
            project.optString("storage_bucket").takeIf(String::isNotBlank)?.let(options::setStorageBucket)
            application=FirebaseApp.initializeApp(context,options.build())
        }
        check(preferences.edit().putString("google_services",value).commit()) { "Could not save the public Firebase configuration." }
    }
}
