package com.mcl.mcllendingapp.presentation.renewal
import com.mcl.mcllendingapp.domain.model.*
import com.mcl.mcllendingapp.presentation.clients.ClientDraft

data class RenewalUiState(val client:Client?=null,val eligibility:RenewalEligibility?=null,val draft:ClientDraft=ClientDraft(),
    val notes:String="",val reviewed:Boolean=false,val canWrite:Boolean=false,val loading:Boolean=true,val busy:Boolean=false,
    val saved:Boolean=false,val error:String?=null,val errors:Map<String,String> = emptyMap())
