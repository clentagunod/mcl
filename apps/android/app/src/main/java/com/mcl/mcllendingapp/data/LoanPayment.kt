package com.mcl.mcllendingapp.data

import kotlinx.coroutines.tasks.await
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

fun todayDate(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
fun money(value: BigDecimal): String = "₱" + value.setScale(2, RoundingMode.HALF_UP).toPlainString()

data class LoanBalance(
    val principal: BigDecimal,
    val interest: BigDecimal,
    val totalPaid: BigDecimal,
    val paidToday: BigDecimal,
    val approvalDate: String,
    val activeLoanId: String = "initial",
    val dailyAmount: BigDecimal = BigDecimal.ZERO,
) {
    val outstanding: BigDecimal get() = (principal + interest - totalPaid).max(BigDecimal.ZERO)
}

fun parsePayment(text: String): BigDecimal {
    require(Regex("[0-9]+(\\.[0-9]{1,2})?").matches(text.trim())) {
        "Enter a valid peso amount with at most two decimal places."
    }
    return text.trim().toBigDecimal().also {
        require(it > BigDecimal.ZERO) { "Payment must be greater than zero." }
        require(it <= BigDecimal("999999999.99")) { "Payment amount is too large." }
    }.setScale(2)
}

fun validatePayment(amount: BigDecimal, balance: LoanBalance, date: String) {
    require(amount > BigDecimal.ZERO) { "Payment must be greater than zero." }
    require(amount <= balance.outstanding) { "Payment exceeds the outstanding balance. Refresh and check the amount." }
    require(date >= balance.approvalDate) { "Payments cannot be recorded before the loan approval date." }
}

/** Matches the web ledger: principal plus fixed interest less all repayments. */
class FirebasePayments(
    private val db: com.google.firebase.firestore.FirebaseFirestore,
    private val auth: com.google.firebase.auth.FirebaseAuth,
) {
    private fun number(value: Any?): BigDecimal =
        (value as? Number)?.toString()?.toBigDecimalOrNull()?.setScale(2, RoundingMode.HALF_UP)
            ?: throw IllegalStateException("The loan contains an invalid amount. Contact your administrator.")

    suspend fun balance(clientId: String): LoanBalance {
        val client = db.collection("clients").document(clientId)
            .get(com.google.firebase.firestore.Source.SERVER).awaitPayment()
        require(client.exists()) { "This client no longer exists." }
        val payments = db.collection("payments").whereEqualTo("clientId", clientId)
            .get(com.google.firebase.firestore.Source.SERVER).awaitPayment()
        val today = todayDate()
        val cycle = client.getString("activeLoanId") ?: "initial"
        val current = currentLoanPayments(clientId, cycle, payments.documents.map {
            Payment(it.id, it.getString("clientId").orEmpty(), number(it.get("amount")),
                it.getString("paymentDate").orEmpty(), it.getString("loanId") ?: "initial")
        })
        return LoanBalance(number(client.get("principal")), number(client.get("interest")),
            current.fold(BigDecimal.ZERO) { sum, receipt -> sum + receipt.amount },
            current.filter { it.paymentDate == today }
                .fold(BigDecimal.ZERO) { sum, receipt -> sum + receipt.amount },
            client.getString("approvalDate") ?: error("Loan approval date is missing."), cycle,
            (client.get("dailyAmount") as? Number)?.toString()?.toBigDecimalOrNull()?.takeIf { it > BigDecimal.ZERO }
                ?: (number(client.get("principal")) + number(client.get("interest"))).divide(BigDecimal((client.getLong("loanTermDays") ?: 45)), 2, RoundingMode.CEILING))
    }

    suspend fun save(id: String, clientId: String, amount: BigDecimal, date: String, loanId: String = "initial") {
        val user = auth.currentUser ?: error("Sign in again before recording a payment.")
        val ref = db.collection("payments").document(id)
        // A retry after an interrupted acknowledgement reuses the same receipt ID.
        val existing = ref.get(com.google.firebase.firestore.Source.SERVER).awaitPayment()
        if (existing.exists()) {
            require(existing.getString("collectorId") == user.uid &&
                existing.getString("clientId") == clientId &&
                number(existing.get("amount")).compareTo(amount) == 0 &&
                existing.getString("paymentDate") == date &&
                (existing.getString("loanId") ?: "initial") == loanId) { "Receipt does not match this payment." }
            return
        }
        require(date == todayDate()) { "The date changed. Reopen the payment form for today." }
        val balance = balance(clientId)
        require(balance.activeLoanId == loanId) { "This loan was renewed. Reopen the payment form." }
        validatePayment(amount, balance, date)
        db.runTransaction { transaction ->
            val receipt = transaction.get(ref)
            val client = transaction.get(db.collection("clients").document(clientId))
            val profile = transaction.get(db.collection("users").document(user.uid))
            val policy = transaction.get(db.document("settings/Configurations/elements/paymentPolicy"))
            require(client.exists()) { "This client no longer exists." }
            require(profile.getString("role") == "collector" && profile.getBoolean("active") != false) {
                "An active collector account is required."
            }
            if (receipt.exists()) {
                require(receipt.getString("clientId") == clientId &&
                    receipt.getString("collectorId") == user.uid &&
                    (receipt.getString("loanId") ?: "initial") == loanId &&
                    receipt.getString("paymentDate") == date &&
                    number(receipt.get("amount")).compareTo(amount) == 0) { "Receipt does not match this payment." }
            } else {
                require((client.getString("activeLoanId") ?: "initial") == loanId) { "This loan was renewed. Reopen the payment form." }
                val daily = (client.get("dailyAmount") as? Number)?.toString()?.toBigDecimalOrNull()?.takeIf { it > BigDecimal.ZERO }
                    ?: (number(client.get("principal")) + number(client.get("interest"))).divide(BigDecimal(client.getLong("loanTermDays") ?: 45), 2, RoundingMode.CEILING)
                if (policy.getBoolean("enforceDailyMinimum") == true) {
                    require(balance.outstanding >= daily) { "Remaining balance is below the daily minimum. Ask an administrator for settlement." }
                    require(amount >= daily) { "Payment is below the required daily amount. Ask an administrator for settlement." }
                }
                require(date >= client.getString("approvalDate").orEmpty()) { "Payment precedes approval." }
                transaction.set(ref, mapOf(
                    "clientId" to clientId, "loanId" to loanId, "amount" to amount.toDouble(), "paymentDate" to date,
                    "collectorId" to user.uid, "collectorName" to profile.getString("fullName").orEmpty(),
                    "createdAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                ))
            }
        }.awaitPayment()
    }
}

private suspend fun <T> com.google.android.gms.tasks.Task<T>.awaitPayment(): T =
    this.await()
