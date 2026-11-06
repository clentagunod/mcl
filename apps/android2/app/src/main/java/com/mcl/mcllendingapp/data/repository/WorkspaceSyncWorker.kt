package com.mcl.mcllendingapp.data.repository

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.firestore.FirebaseFirestoreException
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.CancellationException

@HiltWorker
class WorkspaceSyncWorker @AssistedInject constructor(
    @Assisted context: Context, @Assisted parameters: WorkerParameters,
    private val repository: AdminRepository,
) : CoroutineWorker(context,parameters) {
    override suspend fun doWork(): Result = try {
        repository.refresh()
        Result.success()
    } catch(cancelled: CancellationException) {
        throw cancelled
    } catch(error: FirebaseFirestoreException) {
        if(error.code in listOf(FirebaseFirestoreException.Code.UNAVAILABLE,
            FirebaseFirestoreException.Code.DEADLINE_EXCEEDED,FirebaseFirestoreException.Code.ABORTED))
            Result.retry() else Result.failure()
    } catch(error: Exception) {
        Result.failure()
    }
}
