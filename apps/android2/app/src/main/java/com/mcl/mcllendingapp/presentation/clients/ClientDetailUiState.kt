package com.mcl.mcllendingapp.presentation.clients
import com.mcl.mcllendingapp.domain.model.Client

data class ClientDetailUiState(val client:Client?=null,val loading:Boolean=true,val isAdmin:Boolean=false,
    val canWrite:Boolean=false,val busy:Boolean=false,val confirmTrash:Boolean=false,val recycled:Boolean=false,val error:String?=null)
