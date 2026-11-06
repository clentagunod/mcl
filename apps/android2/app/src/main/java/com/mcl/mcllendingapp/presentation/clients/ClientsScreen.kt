package com.mcl.mcllendingapp.presentation.clients

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.*
import com.mcl.mcllendingapp.ui.theme.*
import com.mcl.mcllendingapp.util.*

@Composable
fun ClientsScreen(onClient:(String)->Unit,onAdd:()->Unit,onTrash:()->Unit,viewModel:ClientsViewModel=hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ClientsContent(state,viewModel::onEvent,onClient,onAdd,onTrash)
}
@Composable
fun ClientsContent(state:ClientsUiState,onEvent:(ClientsEvent)->Unit,onClient:(String)->Unit,onAdd:()->Unit,onTrash:()->Unit) {
    if(state.confirmTrash) ConfirmAction("Move clients to Trash?",
        "The selected ${state.selected.size} clients leave active reports. Their receipts and renewal history remain available for restoration.",
        "Move to Trash",state.busy,{ onEvent(ClientsEvent.CancelTrash) },{ onEvent(ClientsEvent.ConfirmTrash) })
    Column(Modifier.fillMaxSize().padding(AppSpacing.medium),verticalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
        Row(horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
            Text("Clients",style=MaterialTheme.typography.headlineMedium,modifier=Modifier.weight(1f))
            if(state.isAdmin) { TextButton(onClick=onTrash) { Text("Trash") }; Button(onClick=onAdd,enabled=state.canWrite) { Text("Add") } }
        }
        OutlinedTextField(state.query.search,{onEvent(ClientsEvent.Search(it))},label={Text("Search name, ID, phone or address")},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
            listOf("all","due","pending","paid").forEach { status -> FilterChip(state.query.status==status,{onEvent(ClientsEvent.Status(status))},label={Text(status.replaceFirstChar(Char::uppercase))}) }
        }
        val sortLabels=remember{mapOf("default" to "Status then name","name" to "Name A–Z","outstanding" to "Highest balance","dueDate" to "Earliest due")}
        var sortOpen by remember { mutableStateOf(false) }
        Box {
            TextButton(onClick={sortOpen=true}) { Text("Sort: ${sortLabels[state.query.sort]?:state.query.sort}") }
            DropdownMenu(sortOpen,{sortOpen=false}) { listOf("default","name","outstanding","dueDate").forEach { key ->
                DropdownMenuItem(text={Text(sortLabels[key]?:key)},onClick={onEvent(ClientsEvent.Sort(key));sortOpen=false}) } }
        }
        if(state.isAdmin) Row(Modifier.horizontalScroll(rememberScrollState()),horizontalArrangement=Arrangement.spacedBy(AppSpacing.extraSmall)) {
            val pageIds=state.records.items.map{it.id}
            val pageSelection=when{
                pageIds.isNotEmpty()&&pageIds.all{it in state.selected}->ToggleableState.On
                pageIds.any{it in state.selected}->ToggleableState.Indeterminate
                else->ToggleableState.Off}
            TriStateCheckbox(state=pageSelection,onClick={onEvent(ClientsEvent.SelectPage)},enabled=pageIds.isNotEmpty(),modifier=Modifier.semantics{contentDescription="Select visible page"})
            Text("Page",Modifier.padding(vertical=AppSpacing.medium))
            TextButton(onClick={onEvent(ClientsEvent.SelectAll)}) { Text("All matches") }
            if(state.selected.isNotEmpty()) {
                TextButton(onClick={onEvent(ClientsEvent.Clear)}) { Text("Clear (${state.selected.size})") }
                TextButton(onClick={onEvent(ClientsEvent.AskTrash)},enabled=state.canWrite&&!state.busy) { Text("Move to Trash") }
            }
        }
        state.notice?.let { Text(it,color=MaterialTheme.colorScheme.primary) }
        PageControls(state.records.page,state.records.pageSize,state.records.total,{onEvent(ClientsEvent.Page(it))},{onEvent(ClientsEvent.PageSize(it))})
        Box(Modifier.weight(1f)) { ScreenStatus(state.loading,state.error,state.records.items.isEmpty(),{onEvent(ClientsEvent.Refresh)},"No matching clients.") {
            LazyColumn(verticalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
                items(state.records.items,key={it.id}) { client ->
                    Card(onClick={onClient(client.id)},modifier=Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(AppSpacing.medium),horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)) {
                            if(state.isAdmin) Checkbox(client.id in state.selected,{onEvent(ClientsEvent.Toggle(client.id))},modifier=Modifier.semantics{contentDescription="Select "+client.displayName})
                            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(AppSpacing.extraSmall)) {
                                Text(client.displayName,style=MaterialTheme.typography.titleMedium)
                                Text("${client.publicId} · ${client.transactionNumber.ifBlank { "Pending ID" }}")
                                Text("${client.status.uppercase()} · ${money(client.outstanding)} outstanding",color=MaterialTheme.colorScheme.primary)
                                Text("Due ${displayDate(client.dueDate)} · Daily ${money(client.dailyAmount)}")
                                Text("${client.daysElapsed}/${client.loanTermDays} collection days")
                            }
                        }
                    }
                }
            }
        } }
    }
}
