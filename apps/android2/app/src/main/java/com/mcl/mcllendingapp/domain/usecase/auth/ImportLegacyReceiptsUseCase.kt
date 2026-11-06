package com.mcl.mcllendingapp.domain.usecase.auth
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import javax.inject.Inject
/** Preserves pending receipts from the former bundled interface before its removal. */
class ImportLegacyReceiptsUseCase @Inject constructor(private val repository:AdminRepository) {
    suspend operator fun invoke(values:Map<String,String>)=repository.importLegacyReceipts(values)
}
