package com.mcl.mcllendingapp.presentation.clients

import com.mcl.mcllendingapp.domain.model.Client
import kotlinx.serialization.Serializable

@Serializable
data class SavedLoanDraft(val draft: ClientDraft, val original: Client? = null, val notes: String = "")
