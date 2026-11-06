package com.mcl.mcllendingapp.domain.usecase.auth
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject
/** Imports the existing project's public Android Firebase configuration. */
class ConfigureFirebaseUseCase @Inject constructor(private val repository:AdminRepository) {
    suspend operator fun invoke(json:String)=repository.configureFirebase(json)
}
