package com.mcl.mcllendingapp.presentation.payments
import com.mcl.mcllendingapp.domain.model.*
sealed interface PaymentsEvent {
    data class Field(val key:String,val value:String):PaymentsEvent
    data class Page(val value:Int):PaymentsEvent
    data class Retry(val receipt:ReceiptAttempt):PaymentsEvent
    data class AskDelete(val payment:Payment):PaymentsEvent
    data object CancelDelete:PaymentsEvent
    data object Delete:PaymentsEvent
    data object ShowForm:PaymentsEvent
    data object HideForm:PaymentsEvent
    data object Submit:PaymentsEvent
    data object Refresh:PaymentsEvent
}
