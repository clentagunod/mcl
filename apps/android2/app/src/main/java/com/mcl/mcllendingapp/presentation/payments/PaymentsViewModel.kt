package com.mcl.mcllendingapp.presentation.payments

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.*
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.domain.usecase.clients.ObserveClientUseCase
import com.mcl.mcllendingapp.domain.usecase.payments.*
import com.mcl.mcllendingapp.domain.usecase.settings.ObserveSettingsUseCase
import com.mcl.mcllendingapp.util.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject

/** Preserves uncertain receipts and reuses the exact reserved payload on retry. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class PaymentsViewModel @Inject constructor(private val saved:SavedStateHandle,observeClient:ObserveClientUseCase,
    observePayments:ObservePaymentsUseCase,observePending:ObservePendingReceiptsUseCase,settings:ObserveSettingsUseCase,
    sync:ObserveSyncUseCase,session:ObserveSessionUseCase,private val reserve:ReservePaymentUseCase,
    private val submit:SubmitPaymentUseCase,private val delete:DeletePaymentUseCase,private val refresh:RefreshUseCase):ViewModel(){
    private val clientId=saved.get<String>("clientId").orEmpty()
    private val requestedLoan=saved.get<String>("loanId").orEmpty()
    private val page=MutableStateFlow(0)
    private val restored=saved.get<String>("paymentDraft")?.let{runCatching{Json.decodeFromString<PaymentDraft>(it)}.getOrNull()}
    private val mutable=MutableStateFlow(PaymentsUiState(date=restored?.date?:businessToday(),
        amount=restored?.amount.orEmpty(),notes=restored?.notes.orEmpty(),showForm=restored?.showForm?:false))
    val uiState = visibleState(mutable) {
        launch{observeClient(clientId).collect{c->update{it.copy(client=c,
            historical=requestedLoan.isNotBlank()&&requestedLoan!=c?.activeLoanId,loanId=requestedLoan.ifBlank{c?.activeLoanId.orEmpty()})}}}
        launch{combine(observeClient(clientId),page){c,p->c to p}.flatMapLatest{(c,p)->
            observePayments(clientId,requestedLoan.ifBlank{c?.activeLoanId.orEmpty()},p)
        }.catch{e->update{it.copy(error=e.message,loading=false)}}.collect{r->update{it.copy(records=r,loading=false)}}}
        launch{observePending(clientId).collect{attempts->update{it.copy(pending=attempts)}}}
        launch{combine(sync(),session()){a,b->a to b}.collect{(a,b)->
            update{it.copy(canWrite=a.canWrite,isAdmin=b.isAdmin,error=a.error,loading=a.loading&&it.records.total==0)}}}
        launch{settings().collect{settingsValue->update{it.copy(defaultNote=settingsValue.general.defaultPaymentNote,enforceMinimum=settingsValue.payments.enforceDailyMinimum)}}}
    }
    fun onEvent(event:PaymentsEvent){
        when(event){
            is PaymentsEvent.Field->update{
                if(it.pending.isNotEmpty()) it else when(event.key){
                    "amount"->it.copy(amount=event.value,fieldErrors=it.fieldErrors-"amount")
                    "date"->it.copy(date=event.value,fieldErrors=it.fieldErrors-"date")
                    "notes"->it.copy(notes=event.value.take(500))
                    else->it}}
            is PaymentsEvent.Page->page.value=event.value.coerceAtLeast(0)
            is PaymentsEvent.AskDelete->update{it.copy(deletion=event.payment)}
            PaymentsEvent.CancelDelete->update{it.copy(deletion=null)}
            PaymentsEvent.Delete->action{mutable.value.deletion?.let{delete(it)};update{it.copy(deletion=null,notice="Receipt deleted. Balance updated.")}}
            PaymentsEvent.ShowForm->update{it.copy(showForm=true)}
            PaymentsEvent.HideForm->update{it.copy(showForm=false)}
            PaymentsEvent.Refresh->action{refresh()}
            is PaymentsEvent.Retry->action{submit(event.receipt);update{it.copy(amount="",notes="",notice="Receipt confirmed.",showForm=false)}}
            PaymentsEvent.Submit->{
                val s=mutable.value;val c=s.client?:return
                if(s.pending.isNotEmpty()||s.historical||!s.canWrite)return
                val errors=buildMap{
                    runCatching{val n=parseMoney(s.amount);require(n>0&&n<=c.outstanding){"Enter a positive amount within outstanding."}}
                        .onFailure{put("amount",it.message.orEmpty())}
                    if(!LoanMath.validDate(s.date)||s.date<c.approvalDate||s.date>businessToday())put("date","Choose a date between approval and today.")
                }
                if(errors.isNotEmpty()){update{it.copy(fieldErrors=errors)};return}
                action{val attempt=reserve(c,parseMoney(s.amount),s.date,s.notes);submit(attempt)
                    update{it.copy(amount="",notes="",showForm=false,notice="Payment confirmed by the server.")}}
            }
        }
    }
    private fun update(change:(PaymentsUiState)->PaymentsUiState) {
        mutable.update(change)
        val state=mutable.value
        saved["paymentDraft"]=Json.encodeToString(PaymentDraft(state.amount,state.date,state.notes,state.showForm))
    }
    private fun action(block:suspend()->Unit){
        if(mutable.value.busy)return
        viewModelScope.launch{
            update{it.copy(busy=true,error=null,notice=null)}
            runCatching{block()}.onFailure{e->update{it.copy(error=e.message)}}
            update{it.copy(busy=false)}
        }
    }
}
