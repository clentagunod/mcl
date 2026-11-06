package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.domain.model.Client
data class ClientFormUiState(val editing:Boolean=false,val original:Client?=null,val draft:ClientDraft=ClientDraft(),val errors:Map<String,String> = emptyMap(),
    val loading:Boolean=false,val busy:Boolean=false,val canWrite:Boolean=false,val saved:Boolean=false,val error:String?=null)
