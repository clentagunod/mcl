package com.mcl.mcllendingapp.presentation.renewal

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.clients.ClientFormFields
import com.mcl.mcllendingapp.presentation.components.FormField
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.util.*

@Composable
fun RenewalScreen(onDone:()->Unit,onHistory:()->Unit,viewModel:RenewalViewModel=hiltViewModel()){
    val s by viewModel.uiState.collectAsStateWithLifecycle();val event=viewModel::onEvent
    LaunchedEffect(s.saved){if(s.saved)onDone()}
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(AppSpacing.medium),
        verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
        Text("Grant renewal",style=MaterialTheme.typography.headlineMedium)
        s.client?.let{Text("${it.displayName} · ${it.publicId} · ${it.transactionNumber}")}
        if(s.loading)LinearProgressIndicator(Modifier.fillMaxWidth())
        s.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
        s.eligibility?.let{e->
            Text(e.reason,color=if(e.eligible)MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error)
            Text("Paid ${money(e.totalPaid)} · Payoff ${e.paidOn?.let(::displayDate)?:"—"} · Due ${displayDate(e.dueDate)}")}
        TextButton(onClick=onHistory){Text("Review renewal history")}
        TextButton(onClick={event(RenewalEvent.Refresh)},enabled=!s.busy&&!s.loading){Text("Recheck eligibility")}
        Text("A new transaction number and isolated loan cycle will be allocated. The client ID and historical receipts remain.")
        ClientFormFields(s.draft,s.errors,{key,value->event(RenewalEvent.Field(key,value))},{event(RenewalEvent.Term(it))},
            {event(RenewalEvent.SuggestDaily)},!s.busy&&!s.loading,borrower=false)
        FormField("Administrator notes",s.notes,{event(RenewalEvent.Notes(it))},enabled=!s.busy&&!s.loading,singleLine=false)
        Row{Checkbox(s.reviewed,{event(RenewalEvent.Reviewed(it))},enabled=!s.busy&&!s.loading);Text("I reviewed the settlement history and approve these terms.",Modifier.weight(1f))}
        Row(horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)){
            TextButton(onClick=onDone,enabled=!s.busy){Text("Cancel")}
            Button(onClick={event(RenewalEvent.Grant)},enabled=s.reviewed&&s.eligibility?.eligible==true&&s.canWrite&&!s.busy&&!s.loading){
                Text(if(s.busy)"Granting…" else "Grant renewal")}
        }
    }
}
