package com.mcl.mcllendingapp.presentation.payments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.*
import com.mcl.mcllendingapp.ui.theme.*
import com.mcl.mcllendingapp.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentsScreen(viewModel:PaymentsViewModel=hiltViewModel()){
    val s by viewModel.uiState.collectAsStateWithLifecycle()
    val event=viewModel::onEvent
    s.deletion?.let{payment->ConfirmAction("Delete receipt?","Delete ${money(payment.amount)} collected on ${displayDate(payment.paymentDate)}? The outstanding balance increases by this amount.",
        "Delete receipt",s.busy,{event(PaymentsEvent.CancelDelete)},{event(PaymentsEvent.Delete)})}
    if(s.showForm)ModalBottomSheet(onDismissRequest={event(PaymentsEvent.HideForm)}){
        Column(Modifier.fillMaxWidth().imePadding().padding(AppSpacing.medium),verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
            Text("Record payment",style=MaterialTheme.typography.titleLarge)
            s.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
            FormField("Amount (PHP)",s.amount,{event(PaymentsEvent.Field("amount",it))},s.fieldErrors["amount"],KeyboardType.Decimal,!s.busy&&s.pending.isEmpty())
            DateField("Collection date",s.date,{event(PaymentsEvent.Field("date",it))},s.fieldErrors["date"],!s.busy&&s.pending.isEmpty())
            FormField("Notes (optional)",s.notes,{event(PaymentsEvent.Field("notes",it))},enabled=!s.busy&&s.pending.isEmpty(),singleLine=false)
            Button(onClick={event(PaymentsEvent.Submit)},enabled=s.canWrite&&!s.busy&&s.pending.isEmpty()&&!s.historical){Text(if(s.busy)"Saving…" else "Save payment")}
        }
    }
    Column(Modifier.fillMaxSize().padding(AppSpacing.medium),verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
        Text("Payments",style=MaterialTheme.typography.headlineMedium)
        s.client?.let{c->
            Text("${c.displayName} · ${c.publicId}")
            if(!s.historical){
            Text("Transaction ${c.transactionNumber}")
            Text("Principal ${money(c.principal)} · Fixed interest ${money(c.interest)}")
            Text("Paid ${money(c.totalPaid)} · Outstanding ${money(c.outstanding)}",style=MaterialTheme.typography.titleMedium)
            Text("Due ${displayDate(c.dueDate)} · ${c.status.uppercase()} · Daily ${money(c.dailyAmount)}")
            if(s.enforceMinimum&&!s.isAdmin) Text("Each receipt must meet the daily minimum. Ask an administrator for smaller final settlements.")
            if(!s.historical)Button(onClick={event(PaymentsEvent.ShowForm)},enabled=s.canWrite&&!s.busy&&c.outstanding>0&&s.pending.isEmpty()){Text(if(c.outstanding<=0)"Fully paid" else "Add payment")}
            }
        }
        if(s.historical)Text("Archived loan ${s.loanId} • read-only receipts")
        s.pending.forEach{attempt->Card(Modifier.fillMaxWidth()){Column(Modifier.padding(AppSpacing.medium)){
            Text("Unconfirmed receipt ${attempt.id}",style=MaterialTheme.typography.titleSmall)
            if(attempt.payment.amount>0)Text("${money(attempt.payment.amount)} · ${displayDate(attempt.payment.paymentDate)} · Loan ${attempt.payment.loanId}")
            else Text("Retained entry requires administrator reconciliation.")
            Text("Collected by ${attempt.payment.collectorName}")
            Text(attempt.payment.notes.ifBlank{s.defaultNote})
            Text(attempt.error?:"Retry this exact receipt to confirm its result. Its ID and amount are retained.")
            Button(onClick={event(PaymentsEvent.Retry(attempt))},enabled=s.canWrite&&!s.busy&&attempt.payment.amount>0){Text("Retry same receipt")}
        }}}
        s.notice?.let{Text(it,color=MaterialTheme.colorScheme.primary)}
        PageControls(s.records.page,s.records.pageSize,s.records.total,{event(PaymentsEvent.Page(it))})
        Box(Modifier.weight(1f)){ScreenStatus(s.loading,s.error,s.records.items.isEmpty(),{event(PaymentsEvent.Refresh)},"No receipts for this loan."){
            LazyColumn(verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
                items(s.records.items,key={it.id}){payment->Card(Modifier.fillMaxWidth()){Column(Modifier.padding(AppSpacing.medium),
                    verticalArrangement=Arrangement.spacedBy(AppSpacing.extraSmall)){
                    Text("${displayDate(payment.paymentDate)} · ${money(payment.amount)}",style=MaterialTheme.typography.titleMedium)
                    Text("Index day ${payment.indexDay?.toString()?:"—"} · ${payment.collectorName}")
                    Text(payment.notes.ifBlank{s.defaultNote});Text("Entered ${displayTime(payment.createdAt)}")
                    if(s.isAdmin&&!s.historical)TextButton(onClick={event(PaymentsEvent.AskDelete(payment))},enabled=s.canWrite&&!s.busy){Text("Delete")}
                }}}
            }
        }}
    }
}
