package com.mcl.mcllendingapp.presentation.clients

@kotlinx.serialization.Serializable
data class ClientDraft(val firstName:String="",val middleName:String="",val lastName:String="",val address:String="",
    val cellphone:String="",val principal:String="",val interest:String="0",val term:Int=45,
    val approval:String="",val daily:String="",val total:String="")
