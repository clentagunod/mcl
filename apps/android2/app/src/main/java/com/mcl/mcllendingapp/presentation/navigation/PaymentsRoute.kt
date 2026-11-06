package com.mcl.mcllendingapp.presentation.navigation
import kotlinx.serialization.Serializable

@Serializable
data class PaymentsRoute(val clientId:String,val loanId:String="")
