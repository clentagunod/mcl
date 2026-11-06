package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class RenewalRecord(val id: String = "", val sequence: Int = 0,
    val previousLoan: Client = Client(), val newLoan: Client = Client(),
    val totalPaid: Double = 0.0, val paidOn: String = "", val dueDate: String = "",
    val newDueDate: String = "", val approvedBy: String = "", val approvedByName: String = "",
    val notes: String = "", val createdAt: Long? = null)
