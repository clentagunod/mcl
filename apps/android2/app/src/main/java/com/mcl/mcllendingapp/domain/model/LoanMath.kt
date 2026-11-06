package com.mcl.mcllendingapp.domain.model

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId

object LoanMath {
    val loanTerms = listOf(45, 50, 58)
    fun today(): String = LocalDate.now(ZoneId.of("Asia/Manila")).toString()
    fun cents(amount: Double): Long {
        require(amount.isFinite() && amount >= 0) { "Enter a finite nonnegative amount." }
        return BigDecimal.valueOf(amount).movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).longValueExact()
    }
    fun money(amount: Double): Long {
        require(amount <= 999_999_999.0) { "Amount exceeds PHP 999,999,999." }
        return cents(amount)
    }
    fun pesos(cents: Long): Double = BigDecimal.valueOf(cents, 2).toDouble()
    fun validDate(value: String): Boolean = runCatching { LocalDate.parse(value).toString() == value }.getOrDefault(false)
    fun dailyPayable(client: Client): Double {
        require(client.loanTermDays in loanTerms) { "Choose a valid loan term." }
        return if (client.dailyAmount > 0) client.dailyAmount else
            pesos((cents(client.principal) + cents(client.interest) + client.loanTermDays - 1) / client.loanTermDays)
    }

    fun schedule(approval: String, term: Int, holidays: Set<String>, today: String = today()): LoanSchedule {
        require(validDate(approval) && term in loanTerms) { "Invalid loan approval date or term. Repair the loan record." }
        var date = LocalDate.parse(approval)
        var counted = 0
        var elapsed = 0
        repeat(3660) {
            date = date.plusDays(1)
            if (date.dayOfWeek != DayOfWeek.SUNDAY && date.toString() !in holidays) {
                counted++
                if (date.toString() <= today) elapsed = counted
                if (counted == term) return LoanSchedule(date.toString(), elapsed)
            }
        }
        error("Unable to compute this loan's due date.")
    }

    fun summarize(client: Client, paidCents: Long, lastDate: String?, holidays: Set<String>,
        today: String = today()): Client {
        val schedule = schedule(client.approvalDate, client.loanTermDays, holidays, today)
        val outstanding = (cents(client.principal) + cents(client.interest) - paidCents).coerceAtLeast(0)
        return client.copy(totalPaid = pesos(paidCents), outstanding = pesos(outstanding),
            dueDate = schedule.dueDate, daysElapsed = schedule.daysElapsed,
            status = if (outstanding == 0L) "paid" else if (today >= schedule.dueDate) "due" else "pending",
            lastPaymentDate = lastDate)
    }

    fun clean(value: String): String = value.trim().replace(Regex("\\s+"), " ")
    fun cellphone(value: String): String {
        val phone = value.replace(Regex("[\\s\\-()]"), "")
        require(Regex("^(09\\d{9}|\\+639\\d{9})$").matches(phone)) { "Enter a valid Philippine mobile number." }
        return phone
    }

    fun validateClient(client: Client): Client {
        require(clean(client.firstName).isNotBlank()) { "First name is required." }
        require(clean(client.lastName).isNotBlank()) { "Last name is required." }
        require(clean(client.address).isNotBlank()) { "Permanent address is required." }
        require(money(client.principal) > 0) { "Principal must be greater than zero." }
        money(client.interest)
        require(client.loanTermDays in loanTerms && validDate(client.approvalDate)) { "Choose a valid loan term and approval date." }
        require(money(dailyPayable(client)) > 0) { "Daily amount must be greater than zero." }
        return client.copy(firstName = clean(client.firstName), middleName = clean(client.middleName),
            lastName = clean(client.lastName), address = clean(client.address),
            cellphone = cellphone(client.cellphone), dailyAmount = dailyPayable(client))
    }

    fun validatePayment(amount: Double, date: String, client: Client, enforceMinimum: Boolean, role: String) {
        val value = money(amount)
        require(value > 0) { "Amount must be greater than zero." }
        require(value <= cents(client.outstanding)) { "Amount exceeds the outstanding balance." }
        require(validDate(date) && date >= client.approvalDate && date <= today()) {
            "Payment date must be between approval and today." }
        if (enforceMinimum && role == "collector") require(value >= cents(dailyPayable(client))) {
            "Collector receipts must meet the daily minimum. Ask an administrator to record a smaller settlement." }
    }

    fun validateRenewal(terms: RenewalTerms, paidOn: String) {
        require(money(terms.principal) > 0 && money(terms.dailyAmount) > 0) { "Principal and daily payable must be greater than zero." }
        money(terms.interest)
        require(terms.loanTermDays in loanTerms && validDate(terms.approvalDate)
            && terms.approvalDate >= paidOn && terms.approvalDate <= today()) {
            "New approval must be on or after settlement and no later than today." }
    }
}
