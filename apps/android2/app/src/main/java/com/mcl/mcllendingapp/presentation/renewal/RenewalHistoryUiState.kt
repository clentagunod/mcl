package com.mcl.mcllendingapp.presentation.renewal
import com.mcl.mcllendingapp.domain.model.*
data class RenewalHistoryUiState(val records:Page<RenewalRecord> = Page(),val loading:Boolean=true,val error:String?=null)
