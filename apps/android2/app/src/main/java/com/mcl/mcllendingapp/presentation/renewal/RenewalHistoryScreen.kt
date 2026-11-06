package com.mcl.mcllendingapp.presentation.renewal

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.presentation.components.*
import com.mcl.mcllendingapp.ui.theme.AppSpacing
import com.mcl.mcllendingapp.util.*

@Composable
fun RenewalHistoryScreen(onReceipts:(String)->Unit,viewModel:RenewalHistoryViewModel=hiltViewModel()){
    val s by viewModel.uiState.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().padding(AppSpacing.medium),verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
        Text("Renewal history",style=MaterialTheme.typography.headlineMedium)
        PageControls(s.records.page,s.records.pageSize,s.records.total,{viewModel.onEvent(RenewalHistoryEvent.Page(it))})
        ScreenStatus(s.loading,s.error,s.records.items.isEmpty(),{viewModel.onEvent(RenewalHistoryEvent.Refresh)},"No renewals yet."){
            LazyColumn(verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
                items(s.records.items,key={it.id}){r->
                    var expanded by rememberSaveable(r.id){mutableStateOf(false)}
                    Card(Modifier.fillMaxWidth()){Column(Modifier.padding(AppSpacing.medium),verticalArrangement=Arrangement.spacedBy(AppSpacing.small)){
                        Text("Renewal ${r.sequence} · Transaction ${r.id}",style=MaterialTheme.typography.titleLarge)
                        Text("${r.newLoan.publicId} · ${r.newLoan.displayName}")
                        Text("${displayTime(r.createdAt)} · ${r.approvedByName} (${r.approvedBy})")
                        Text("Principal ${money(r.newLoan.principal)} · Interest ${money(r.newLoan.interest)} · Total ${money(r.newLoan.totalPayable)}")
                        Text("Daily ${money(r.newLoan.dailyAmount)} · ${r.newLoan.loanTermDays} days")
                        Text("Approved ${displayDate(r.newLoan.approvalDate)} · Due ${displayDate(r.newDueDate)}")
                        if(r.notes.isNotBlank())Text(r.notes)
                        TextButton(onClick={expanded=!expanded}){Text(if(expanded)"Hide previous loan" else "Review previous loan")}
                        if(expanded){
                            Text("Previous transaction ${r.previousLoan.transactionNumber}")
                            Text("Principal ${money(r.previousLoan.principal)} · Interest ${money(r.previousLoan.interest)}")
                            Text("Daily ${money(r.previousLoan.dailyAmount)} · ${r.previousLoan.loanTermDays} days")
                            Text("Approved ${displayDate(r.previousLoan.approvalDate)} · Due ${displayDate(r.dueDate)}")
                            Text("Settled ${money(r.totalPaid)} on ${displayDate(r.paidOn)} · Closing balance ${money(0.0)}")
                            OutlinedButton(onClick={onReceipts(r.previousLoan.activeLoanId)}){Text("View archived receipts")}
                        }
                    }}
                }
            }
        }
    }
}
