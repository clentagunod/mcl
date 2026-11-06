package com.mcl.mcllendingapp.presentation.payments
import com.mcl.mcllendingapp.domain.model.*

data class PaymentsUiState(val client:Client?=null,val records:Page<Payment> = Page(),val pending:List<ReceiptAttempt> = emptyList(),
    val defaultNote:String="Daily Payment",val amount:String="",val date:String="",val notes:String="",val isAdmin:Boolean=false,val enforceMinimum:Boolean=false,
    val historical:Boolean=false,val loanId:String="",val canWrite:Boolean=false,val loading:Boolean=true,val busy:Boolean=false,val showForm:Boolean=false,
    val deletion:Payment?=null,val error:String?=null,val notice:String?=null,val fieldErrors:Map<String,String> = emptyMap())
