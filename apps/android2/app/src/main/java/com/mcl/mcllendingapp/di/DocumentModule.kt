package com.mcl.mcllendingapp.di

import com.mcl.mcllendingapp.domain.repository.DocumentRepository
import com.mcl.mcllendingapp.data.repository.NativeDocumentRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
abstract class DocumentModule {
    @Binds
    abstract fun documents(implementation: NativeDocumentRepository): DocumentRepository
}
