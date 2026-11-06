package com.mcl.mcllendingapp.di

import android.content.Context
import androidx.room.Room
import com.mcl.mcllendingapp.data.local.CacheDao
import com.mcl.mcllendingapp.data.local.MclDatabase
import com.mcl.mcllendingapp.data.repository.FirebaseAdminRepository
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides @Singleton
    fun database(@ApplicationContext context: Context): MclDatabase =
        Room.databaseBuilder(context,MclDatabase::class.java,"mcl-workspace.db").build()

    @Provides fun cache(database: MclDatabase): CacheDao=database.cache()

    @Provides @Singleton
    fun json(): Json=Json { ignoreUnknownKeys=true; encodeDefaults=true }

    @Provides @Singleton
    fun repository(implementation: FirebaseAdminRepository): AdminRepository=implementation
}
