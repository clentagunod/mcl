package com.mcl.mcllendingapp.data

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreSettings
import com.google.firebase.firestore.MemoryCacheSettings
import com.google.firebase.firestore.Source
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class Collector(val uid: String, val fullName: String)
data class Client(val id: String, val firstName: String, val middleName: String, val lastName: String) {
    val displayName: String get() = listOf(firstName, middleName, lastName).filter { it.isNotBlank() }.joinToString(" ")
    fun matches(query: String): Boolean = query.trim().split(Regex("\\s+")).all {
        displayName.contains(it, ignoreCase = true)
    }
}

sealed interface Session {
    data object SignedOut : Session
    data object Checking : Session
    data class Authorized(val collector: Collector) : Session
    data class Denied(val message: String) : Session
}

interface CollectorRepository {
    fun sessions(): Flow<Session>
    suspend fun signIn(email: String, password: String)
    fun signOut()
    suspend fun clients(): List<Client>
    suspend fun balance(clientId: String): LoanBalance
    suspend fun savePayment(id: String, clientId: String, amount: java.math.BigDecimal, date: String)
}

/** Uses the web app's default database and collections; never writes client records. */
class FirebaseCollectorRepository(
    private val auth: FirebaseAuth,
    private val db: FirebaseFirestore,
) : CollectorRepository {
    private val payments = FirebasePayments(db, auth)
    override suspend fun balance(clientId: String) = payments.balance(clientId)
    override suspend fun savePayment(id: String, clientId: String, amount: java.math.BigDecimal, date: String) =
        payments.save(id, clientId, amount, date)

    override fun sessions(): Flow<Session> = callbackFlow {
        var profileListener: com.google.firebase.firestore.ListenerRegistration? = null
        val listener = FirebaseAuth.AuthStateListener { current ->
            profileListener?.remove()
            profileListener = null
            val user = current.currentUser
            if (user == null) {
                trySend(Session.SignedOut)
            } else {
                trySend(Session.Checking)
                profileListener = db.collection("users").document(user.uid)
                    .addSnapshotListener(com.google.firebase.firestore.MetadataChanges.INCLUDE) { snapshot, error ->
                        if (auth.currentUser?.uid != user.uid) return@addSnapshotListener
                        if (error != null) {
                            trySend(Session.Denied("Unable to verify access. Check your connection and sign in again."))
                        } else if (snapshot != null && !snapshot.metadata.isFromCache) {
                            if (snapshot.getString("role") == "collector" && snapshot.getBoolean("active") != false) {
                                trySend(Session.Authorized(Collector(user.uid, snapshot.getString("fullName").orEmpty())))
                            } else {
                                trySend(Session.Denied("An active collector account is required. Contact your administrator."))
                            }
                        }
                    }
            }
        }
        auth.addAuthStateListener(listener)
        awaitClose {
            auth.removeAuthStateListener(listener)
            profileListener?.remove()
        }
    }

    override suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    override fun signOut() = auth.signOut()

    override suspend fun clients(): List<Client> =
        db.collection("clients").get(Source.SERVER).await().documents.map { doc ->
            Client(doc.id, doc.getString("firstName").orEmpty(),
                doc.getString("middleName").orEmpty(), doc.getString("lastName").orEmpty())
        }.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })

    companion object {
        private val instance: FirebaseCollectorRepository by lazy {
            val db = FirebaseFirestore.getInstance()
            db.firestoreSettings = FirebaseFirestoreSettings.Builder()
                .setLocalCacheSettings(MemoryCacheSettings.newBuilder().build()).build()
            FirebaseCollectorRepository(FirebaseAuth.getInstance(), db)
        }

        fun create(): FirebaseCollectorRepository = instance
    }
}
