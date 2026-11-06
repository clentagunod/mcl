package com.mcl.mcllendingapp.data.remote

import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldPath
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.Source
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

class FirestoreSource @Inject constructor() {
    suspend fun scan(source: Query, onPage: suspend (List<DocumentSnapshot>) -> Unit) {
        var cursor: DocumentSnapshot? = null
        while (true) {
            currentCoroutineContext().ensureActive()
            var page = source.orderBy(FieldPath.documentId()).limit(100)
            cursor?.let { page = page.startAfter(it) }
            val documents = page.get(Source.SERVER).await().documents
            if (documents.isEmpty()) break
            onPage(documents)
            if (documents.size < 100) break
            cursor = documents.last()
        }
    }
}
