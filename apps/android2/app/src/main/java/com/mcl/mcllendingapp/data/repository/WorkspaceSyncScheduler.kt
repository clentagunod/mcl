package com.mcl.mcllendingapp.data.repository

import android.content.Context
import androidx.work.*
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject

class WorkspaceSyncScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    fun schedule() {
        val request=PeriodicWorkRequestBuilder<WorkspaceSyncWorker>(15,TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork("mcl-authorized-cache-sync",
            ExistingPeriodicWorkPolicy.KEEP,request)
    }
}
