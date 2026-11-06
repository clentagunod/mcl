package com.mcl.mcllendingapp.presentation.clients

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.*
import com.mcl.mcllendingapp.ui.theme.*

@Composable
fun ClientFormScreen(onDone:()->Unit,viewModel:ClientFormViewModel=hiltViewModel()) {
    val s by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(s.saved){if(s.saved)onDone()}
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(AppSpacing.medium),
        verticalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
        Text(if(s.editing)"Edit client" else "Add client",style=MaterialTheme.typography.headlineMedium)
        s.original?.let{Text("${it.publicId} · ${it.transactionNumber}")}
        s.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
        if(s.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
        ClientFormFields(s.draft,s.errors,{key,value->viewModel.onEvent(ClientFormEvent.Field(key,value))},{viewModel.onEvent(ClientFormEvent.Term(it))},
            {viewModel.onEvent(ClientFormEvent.SuggestDaily)},enabled=!s.busy&&!s.loading)
        Row(horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
            TextButton(onClick=onDone,enabled=!s.busy&&!s.loading){Text("Cancel")}
            Button(onClick={viewModel.onEvent(ClientFormEvent.Save)},enabled=s.canWrite&&!s.busy&&!s.loading){Text(if(s.busy)"Saving…" else "Save client")}
        }
    }
}
@Composable
fun ClientFormFields(d:ClientDraft,errors:Map<String,String>,onField:(String,String)->Unit,onTerm:(Int)->Unit,onSuggest:()->Unit,
    enabled:Boolean=true,borrower:Boolean=true) {
    if(borrower) {
        Text("Borrower",style=MaterialTheme.typography.titleLarge)
        listOf("lastName" to ("Last name" to d.lastName),"firstName" to ("First name" to d.firstName),"middleName" to ("Middle name (optional)" to d.middleName),
            "address" to ("Permanent address" to d.address),"cellphone" to ("Cellphone" to d.cellphone)).forEach{(key,pair)->
            FormField(pair.first,pair.second,{onField(key,it)},errors[key],if(key=="cellphone")KeyboardType.Phone else KeyboardType.Text,enabled)}
    }
    Text("Loan terms",style=MaterialTheme.typography.titleLarge)
    FormField("Principal (PHP)",d.principal,{onField("principal",it)},errors["principal"],KeyboardType.Decimal,enabled)
    FormField("Fixed interest (PHP)",d.interest,{onField("interest",it)},errors["interest"],KeyboardType.Decimal,enabled)
    Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
        listOf(45,50,58).forEach{term->FilterChip(d.term==term,{onTerm(term)},label={Text("$term days")},enabled=enabled)}
    }
    DateField("Approval date",d.approval,{onField("approval",it)},errors["approval"],enabled)
    FormField("Agreed daily payable (PHP)",d.daily,{onField("daily",it)},errors["daily"],KeyboardType.Decimal,enabled)
    TextButton(onClick=onSuggest,enabled=enabled){Text("Use suggested daily amount")}
    if(d.total.isNotBlank()) Text("Total payable: ${d.total}",style=MaterialTheme.typography.titleMedium)
}
