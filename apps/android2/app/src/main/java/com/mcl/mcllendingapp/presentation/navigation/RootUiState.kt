package com.mcl.mcllendingapp.presentation.navigation
import com.mcl.mcllendingapp.domain.model.*
data class RootUiState(val session:SessionState=SessionState(),val sync:SyncState=SyncState(),val theme:String="system",val error:String?=null,val legacyComplete:Boolean=false,val businessName:String="MCL Dashboard")
