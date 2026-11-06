package com.mcl.mcllendingapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.mcl.mcllendingapp.data.money
import java.math.BigDecimal

@Composable
fun PaymentDialog(payment: PaymentUiState, notice: String?, model: CollectorViewModel) {
    AlertDialog(
        onDismissRequest = { if (!payment.saving) model.closePayment() },
        title = { Text("Record principal repayment") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(payment.client.displayName, style = MaterialTheme.typography.titleMedium)
                Text("Client ID: ${payment.client.id}")
                Text("Payment date: ${payment.date}")
                if (payment.loading) CircularProgressIndicator()
                payment.balance?.let { balance ->
                    Text("Principal: ${money(balance.principal)}")
                    Text("Fixed interest: ${money(balance.interest)}")
                    Text("Total repaid: ${money(balance.totalPaid)}")
                    Text("Paid today: ${money(balance.paidToday)}")
                    Text("Outstanding balance: ${money(balance.outstanding)}",
                        style = MaterialTheme.typography.titleMedium)
                    if (balance.outstanding > BigDecimal.ZERO || payment.submitted) {
                        OutlinedTextField(payment.amount, model::paymentAmount,
                            label = { Text("Amount paid today (₱)") }, singleLine = true,
                            enabled = !payment.saving && !payment.submitted,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.fillMaxWidth())
                    } else Text("This loan is fully paid.")
                }
                notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                payment.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (payment.balance == null && !payment.loading) {
                    TextButton(onClick = { model.reloadBalance(payment.client.id) }) { Text("Retry balance") }
                }
                if (payment.saving) Text("Saving payment. Please wait for confirmation.")
            }
        },
        confirmButton = {
            Button(onClick = model::savePayment,
                enabled = !payment.loading && !payment.saving &&
                    payment.balance != null && payment.amount.isNotBlank()) {
                Text(when { payment.saving -> "Saving…"; payment.submitted -> "Retry same payment"; else -> "Save payment" })
            }
        },
        dismissButton = {
            TextButton(onClick = model::closePayment, enabled = !payment.saving) { Text("Close") }
        },
    )
}
