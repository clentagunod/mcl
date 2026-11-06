package com.mcl.mcllendingapp.presentation.clients

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.*
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.util.*

@Composable
fun ClientDetailScreen(onPayments:()->Unit,onEdit:()->Unit,onPrint:()->Unit,onRenew:()->Unit,onHistory:()->Unit,onRecycled:()->Unit,
    viewModel:ClientDetailViewModel=hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(state.recycled){if(state.recycled) onRecycled()}
    if(state.confirmTrash) ConfirmAction("Move client to Trash?","Loan details, receipts and renewal history will be retained for restoration.",
        "Move to Trash",state.busy,{viewModel.onEvent(ClientDetailEvent.CancelTrash)},{viewModel.onEvent(ClientDetailEvent.ConfirmTrash)})
    ScreenStatus(state.loading,state.error,state.client==null,{viewModel.onEvent(ClientDetailEvent.Refresh)},"Client unavailable.") {
        val c=state.client ?: return@ScreenStatus
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AppSpacing.medium),
            verticalArrangement=Arrangement.spacedBy(AppSpacing.medium)) {
            Text(c.fullName,style=MaterialTheme.typography.headlineMedium)
            Text("${c.publicId} · Transaction ${c.transactionNumber.ifBlank{"Pending"}}")
            Text(c.status.uppercase(),color=MaterialTheme.colorScheme.primary)
            Text(c.address);Text(c.cellphone)
            HorizontalDivider()
            listOf("Principal" to money(c.principal),"Fixed interest" to money(c.interest),
                "Total payable" to money(c.totalPayable),"Total paid" to money(c.totalPaid),"Outstanding" to money(c.outstanding),
                "Daily payable" to money(c.dailyAmount),"Approval" to displayDate(c.approvalDate),"Due date" to displayDate(c.dueDate),
                "Collection days" to "${c.daysElapsed}/${c.loanTermDays}","Last payment" to (c.lastPaymentDate?.let(::displayDate)?:"None"),
                "Renewals" to c.renewalCount.toString()).forEach{(label,value)->Row(Modifier.fillMaxWidth()){
                    Text(label,Modifier.weight(1f));Text(value,style=MaterialTheme.typography.titleSmall)}}
            Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)){
                Button(onClick=onPayments){Text("Payments")}
                OutlinedButton(onClick=onPrint){Text(if(state.isAdmin)"Print documents" else "Index card")}
                if(state.isAdmin) {
                    OutlinedButton(onClick=onEdit,enabled=state.canWrite){Text("Edit")}
                    if(c.status=="paid") OutlinedButton(onClick=onRenew,enabled=state.canWrite&&c.transactionNumber.isNotBlank()){Text("Renew")}
                    if(c.renewalCount>0) OutlinedButton(onClick=onHistory){Text("Renewal history")}
                }
            }
            if(state.isAdmin) TextButton(onClick={viewModel.onEvent(ClientDetailEvent.AskTrash)},enabled=state.canWrite&&!state.busy){Text("Move to Trash")}
        }
    }
}
