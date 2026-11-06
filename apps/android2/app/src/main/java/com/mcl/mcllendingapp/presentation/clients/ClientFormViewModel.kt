package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.*
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.auth.ObserveSyncUseCase
import com.mcl.mcllendingapp.domain.usecase.clients.*
import com.mcl.mcllendingapp.util.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject

/** Holds borrower edits and submits the opening revision for conflict detection. */
@HiltViewModel
class ClientFormViewModel @Inject constructor(private val saved:SavedStateHandle,observe:ObserveClientUseCase,
    sync:ObserveSyncUseCase,private val save:SaveClientUseCase):ViewModel() {
    private val id=saved.get<String>("clientId").orEmpty()
    private val restored=saved.get<String>("formDraft")?.let{runCatching{Json.decodeFromString<SavedLoanDraft>(it)}.getOrNull()}
    private val mutable=MutableStateFlow(ClientFormUiState(editing=id.isNotBlank(),original=restored?.original,
        draft=restored?.draft?:ClientDraft(approval=businessToday()),loading=id.isNotBlank()&&restored?.original==null))
    val uiState = visibleState(mutable) {
        if(id.isNotBlank()&&mutable.value.original==null) launch { combine(observe(id),sync()){c,s->c to s}.first{(c,s)->c!=null||(s.complete&&!s.loading)||s.error!=null}.let{(c,s)->
            if(c==null){update{it.copy(loading=false,error=s.error?:"Client is no longer available.")};return@let}

            update{it.copy(original=c,loading=false,draft=ClientDraft(c.firstName,c.middleName,c.lastName,c.address,c.cellphone,
                c.principal.toString(),c.interest.toString(),c.loanTermDays,c.approvalDate,c.dailyAmount.toString(),money(c.totalPayable)))} } }
        launch{sync().collect{syncState->update{it.copy(canWrite=syncState.canWrite&&(id.isBlank()||it.original!=null))}}}
    }
    fun onEvent(event:ClientFormEvent) {
        when(event) {
            is ClientFormEvent.Field -> update { s->
                val d=s.draft
                val n=when(event.key){
                    "firstName"->d.copy(firstName=event.value);"middleName"->d.copy(middleName=event.value);"lastName"->d.copy(lastName=event.value)
                    "address"->d.copy(address=event.value);"cellphone"->d.copy(cellphone=event.value);"principal"->d.copy(principal=event.value)
                    "interest"->d.copy(interest=event.value);"approval"->d.copy(approval=event.value);"daily"->d.copy(daily=event.value);else->d}
                val total=runCatching{money(n.principal.toBigDecimal().add(n.interest.toBigDecimal()).toDouble())}.getOrDefault("")
                s.copy(draft=n.copy(total=total),errors=s.errors-event.key,error=null)}
            is ClientFormEvent.Term->update{it.copy(draft=it.draft.copy(term=event.value))}
            ClientFormEvent.SuggestDaily->runCatching {
                val d=mutable.value.draft
                val daily=LoanMath.dailyPayable(Client(principal=parseMoney(d.principal),interest=parseMoney(d.interest),loanTermDays=d.term))
                update{it.copy(draft=it.draft.copy(daily=daily.toString()))}
            }.onFailure{e->update{it.copy(error=e.message)}}
            ClientFormEvent.Save->submit()
        }
    }
    private fun update(change:(ClientFormUiState)->ClientFormUiState) {
        mutable.update(change)
        val state=mutable.value
        saved["formDraft"]=Json.encodeToString(SavedLoanDraft(state.draft,state.original))
    }
    private fun submit() {
        val s=mutable.value
        if(s.busy||s.loading||!s.canWrite||(id.isNotBlank()&&s.original==null)) return
        val errors=buildMap {
            if(s.draft.firstName.isBlank()) put("firstName","First name is required.")
            if(s.draft.lastName.isBlank()) put("lastName","Last name is required.")
            if(s.draft.address.isBlank()) put("address","Address is required.")
            runCatching{LoanMath.cellphone(s.draft.cellphone)}.onFailure{put("cellphone",it.message.orEmpty())}
            listOf("principal" to s.draft.principal,"interest" to s.draft.interest,"daily" to s.draft.daily).forEach{(key,value)->
                runCatching{val n=parseMoney(value);require(key=="interest"||n>0){"Must be greater than zero."}}.onFailure{put(key,it.message.orEmpty())}}
            if(!LoanMath.validDate(s.draft.approval)) put("approval","Choose a valid date.")
        }
        if(errors.isNotEmpty()){update{it.copy(errors=errors)};return}
        viewModelScope.launch {
            update{it.copy(busy=true,error=null)}
            runCatching{
                val d=s.draft
                save((s.original?:Client()).copy(firstName=d.firstName,middleName=d.middleName,lastName=d.lastName,address=d.address,
                    cellphone=d.cellphone,principal=parseMoney(d.principal),interest=parseMoney(d.interest),loanTermDays=d.term,
                    approvalDate=d.approval,dailyAmount=parseMoney(d.daily)),s.original)
            }.onSuccess{update{it.copy(saved=true)}}.onFailure{e->update{it.copy(error=e.message)}}
            update{it.copy(busy=false)}
        }
    }
}
