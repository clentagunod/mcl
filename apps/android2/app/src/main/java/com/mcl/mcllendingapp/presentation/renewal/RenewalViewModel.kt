package com.mcl.mcllendingapp.presentation.renewal

import com.mcl.mcllendingapp.presentation.components.visibleState
import androidx.lifecycle.*
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.domain.usecase.clients.ObserveClientUseCase
import com.mcl.mcllendingapp.domain.usecase.renewal.*
import com.mcl.mcllendingapp.presentation.clients.ClientDraft
import com.mcl.mcllendingapp.presentation.clients.SavedLoanDraft
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import com.mcl.mcllendingapp.util.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Requires explicit reviewed approval and rechecks settlement before granting a new cycle. */
@HiltViewModel
class RenewalViewModel @Inject constructor(private val saved:SavedStateHandle,observe:ObserveClientUseCase,
    sync:ObserveSyncUseCase,private val eligibility:GetRenewalEligibilityUseCase,private val grant:GrantRenewalUseCase):ViewModel(){
    private val id=saved.get<String>("clientId").orEmpty()
    private val restored=saved.get<String>("formDraft")?.let{runCatching{Json.decodeFromString<SavedLoanDraft>(it)}.getOrNull()}
    private val mutable=MutableStateFlow(RenewalUiState(client=restored?.original,
        draft=restored?.draft?:ClientDraft(),notes=restored?.notes.orEmpty()))
    val uiState = visibleState(mutable) {
        launch{
            if(mutable.value.client==null) combine(observe(id),sync()){c,s->c to s}.first{(c,s)->c!=null||(s.complete&&!s.loading)||s.error!=null}.let{(c,s)->
                if(c==null){update{it.copy(loading=false,error=s.error?:"Client is no longer available.")};return@let}

                update{it.copy(client=c,draft=ClientDraft(principal=c.principal.toString(),interest=c.interest.toString(),
                    term=c.loanTermDays,approval=businessToday(),daily=c.dailyAmount.toString(),total=money(c.totalPayable)))}}
            verify()
        }
        launch{sync().collect{s->update{it.copy(canWrite=s.canWrite,error=s.error?:it.error)}}}
    }
    fun onEvent(event:RenewalEvent){
        when(event){
            is RenewalEvent.Field->update{s->
                val d=s.draft
                val n=when(event.key){"principal"->d.copy(principal=event.value);"interest"->d.copy(interest=event.value)
                    "daily"->d.copy(daily=event.value);"approval"->d.copy(approval=event.value);else->d}
                s.copy(draft=n.copy(total=runCatching{money(n.principal.toBigDecimal().add(n.interest.toBigDecimal()).toDouble())}.getOrDefault("")),
                    reviewed=false,errors=s.errors-event.key)}
            is RenewalEvent.Term->update{it.copy(draft=it.draft.copy(term=event.value),reviewed=false)}
            is RenewalEvent.Reviewed->update{it.copy(reviewed=event.value)}
            is RenewalEvent.Notes->update{it.copy(notes=event.value.take(1500))}
            RenewalEvent.SuggestDaily->runCatching{
                val d=mutable.value.draft
                val n=LoanMath.dailyPayable(Client(principal=parseMoney(d.principal),interest=parseMoney(d.interest),loanTermDays=d.term))
                update{it.copy(draft=it.draft.copy(daily=n.toString()),reviewed=false)}
            }.onFailure{e->update{it.copy(error=e.message)}}
            RenewalEvent.Refresh->viewModelScope.launch{verify()}
            RenewalEvent.Grant->{
                val s=mutable.value;val c=s.client?:return
                if(!s.reviewed||!s.canWrite||s.eligibility?.eligible!=true||s.busy||s.loading)return
                val errors=buildMap{
                    listOf("principal" to s.draft.principal,"interest" to s.draft.interest,"daily" to s.draft.daily).forEach{(key,value)->
                        runCatching{val amount=parseMoney(value);require(key=="interest"||amount>0){"Must be greater than zero."}}
                            .onFailure{put(key,it.message.orEmpty())}
                    }
                    if(!LoanMath.validDate(s.draft.approval)||s.draft.approval<s.eligibility.paidOn.orEmpty()||s.draft.approval>businessToday())
                        put("approval","Choose a date from settlement through today.")
                }
                if(errors.isNotEmpty()){update{it.copy(errors=errors)};return}
                viewModelScope.launch{
                    update{it.copy(busy=true,error=null)}
                    runCatching{
                        val d=s.draft
                        val terms=RenewalTerms(principal=parseMoney(d.principal),interest=parseMoney(d.interest),dailyAmount=parseMoney(d.daily),loanTermDays=d.term,approvalDate=d.approval)
                        LoanMath.validateRenewal(terms,s.eligibility.paidOn.orEmpty())
                        grant(c,terms,s.notes)
                    }.onSuccess{update{it.copy(saved=true)}}.onFailure{e->update{it.copy(error=e.message,reviewed=false)}}
                    update{it.copy(busy=false)}
                }
            }
        }
    }
    private fun update(change:(RenewalUiState)->RenewalUiState) {
        mutable.update(change)
        val state=mutable.value
        saved["formDraft"]=Json.encodeToString(SavedLoanDraft(state.draft,state.client,state.notes))
    }
    private suspend fun verify(){
        update{it.copy(loading=true,error=null)}
        runCatching{eligibility(id)}.onSuccess{e->update{it.copy(eligibility=e)}}.onFailure{e->update{it.copy(error=e.message)}}
        update{it.copy(loading=false)}
    }
}
