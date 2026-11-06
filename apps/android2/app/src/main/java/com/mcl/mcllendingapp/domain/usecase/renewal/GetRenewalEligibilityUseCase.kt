package com.mcl.mcllendingapp.domain.usecase.renewal
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject
/** Verifies all current and historical loan settlement requirements. */
class GetRenewalEligibilityUseCase @Inject constructor(private val repository:AdminRepository){
    suspend operator fun invoke(clientId:String)=repository.renewalEligibility(clientId)
}
