package com.mcl.mcllendingapp.domain.model

data class LoanBalance(val loanId: String, val paidCents: Long, val revision: Long) {
    init {
        require(loanId.isNotBlank() && paidCents >= 0 && revision >= 0) { reconciliationMessage }
    }

    fun outstanding(totalCents: Long): Long {
        check(totalCents > 0 && paidCents <= totalCents) { reconciliationMessage }
        return totalCents - paidCents
    }

    fun receive(amountCents: Long, totalCents: Long): LoanBalance {
        require(amountCents > 0) { "Amount must be greater than zero." }
        check(amountCents <= outstanding(totalCents)) { "Amount exceeds the outstanding balance. Keep the reserved receipt for reconciliation." }
        return copy(paidCents = Math.addExact(paidCents, amountCents), revision = Math.addExact(revision, 1))
    }

    fun remove(amountCents: Long): LoanBalance {
        check(amountCents > 0 && amountCents <= paidCents) { reconciliationMessage }
        return copy(paidCents = paidCents - amountCents, revision = Math.addExact(revision, 1))
    }

    fun adjust(totalCents: Long): LoanBalance {
        outstanding(totalCents)
        return copy(revision = Math.addExact(revision, 1))
    }

    fun renew(newLoanId: String, totalCents: Long): LoanBalance {
        check(totalCents > 0 && paidCents == totalCents && newLoanId.isNotBlank() && newLoanId != loanId) { reconciliationMessage }
        return LoanBalance(newLoanId, 0, Math.addExact(revision, 1))
    }

    fun requireUnchanged(expected: LoanBalance) {
        check(this == expected) { "Receipts or loan details changed during review. Reopen renewal and review the latest history." }
    }

    companion object {
        const val reconciliationMessage = "The loan balance is missing or inconsistent. Ask an administrator to complete the ledger rollout or reconcile this loan."

        fun fromFields(fields: Map<String, Any?>?): LoanBalance {
            check(fields != null) { reconciliationMessage }
            val loanId = fields["loanId"] as? String ?: error(reconciliationMessage)
            return LoanBalance(loanId, integer(fields["paidCents"]), integer(fields["revision"]))
        }

        private fun integer(value: Any?): Long = when (value) {
            is Long -> value
            is Int -> value.toLong()
            is Short -> value.toLong()
            is Byte -> value.toLong()
            else -> error(reconciliationMessage)
        }
    }
}
