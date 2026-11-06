package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class Client(
    val id: String = "", val firstName: String = "", val middleName: String = "",
    val lastName: String = "", val address: String = "", val cellphone: String = "",
    val principal: Double = 0.0, val interest: Double = 0.0, val loanTermDays: Int = 45,
    val approvalDate: String = "", val dailyAmount: Double = 0.0,
    val clientNumber: String = "", val transactionNumber: String = "",
    val activeLoanId: String = "initial", val originalTransactionNumber: String = "",
    val renewalCount: Int = 0, val revision: String = "",
    val totalPaid: Double = 0.0, val outstanding: Double = 0.0,
    val dueDate: String = "", val daysElapsed: Int = 0, val status: String = "pending",
    val lastPaymentDate: String? = null,
) {
    val displayName: String get() = "$lastName, $firstName" + if (middleName.isBlank()) "" else " ${middleName.first().uppercaseChar()}."
    val fullName: String get() = listOf(firstName, middleName, lastName).filter(String::isNotBlank).joinToString(" ")
    val publicId: String get() = clientNumber.ifBlank { id }
    val totalPayable: Double get() = principal + interest
}
