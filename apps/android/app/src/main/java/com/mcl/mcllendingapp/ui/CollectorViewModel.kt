package com.mcl.mcllendingapp.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.data.*
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectorUiState(
    val checking: Boolean = true,
    val collector: Collector? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val query: String = "",
    val clients: List<Client> = emptyList(),
    val loadingClients: Boolean = false,
    val clientError: String? = null,
    val payment: PaymentUiState? = null,
    val notice: String? = null,
) {
    val results: List<Client> get() = if (query.isBlank()) emptyList() else clients.filter { it.matches(query) }
}

class CollectorViewModel(private val repository: CollectorRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CollectorUiState())
    val state = mutableState.asStateFlow()
    private var clientJob: Job? = null

    init {
        viewModelScope.launch {
            repository.sessions().collect { session ->
                when (session) {
                    Session.Checking -> mutableState.value = CollectorUiState()
                    Session.SignedOut -> {
                        clientJob?.cancel()
                        mutableState.update { CollectorUiState(checking = false, error = it.error) }
                    }
                    is Session.Denied -> {
                        clientJob?.cancel()
                        mutableState.value = CollectorUiState(checking = false, error = session.message)
                        repository.signOut()
                    }
                    is Session.Authorized -> {
                        val changed = mutableState.value.collector?.uid != session.collector.uid
                        mutableState.update { it.copy(checking = false, busy = false, collector = session.collector, error = null) }
                        if (changed) refresh()
                    }
                }
            }
        }
    }

    fun signIn(email: String, password: String) {
        if (mutableState.value.busy) return
        if (email.isBlank() || password.isBlank()) {
            mutableState.update { it.copy(error = "Enter your email and password.") }
            return
        }
        mutableState.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            try {
                repository.signIn(email, password)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                val message = when (error) {
                    is FirebaseNetworkException -> "Cannot connect. Check your internet connection and try again."
                    is FirebaseTooManyRequestsException -> "Too many attempts. Please try again later."
                    else -> "Unable to sign in. Check your email and password, or contact your administrator."
                }
                mutableState.update { it.copy(checking = false, busy = false, error = message) }
            }
        }
    }

    fun search(query: String) { mutableState.update { it.copy(query = query) } }

    fun refresh() {
        val uid = mutableState.value.collector?.uid ?: return
        clientJob?.cancel()
        clientJob = viewModelScope.launch {
            mutableState.update { it.copy(loadingClients = true, clientError = null, clients = emptyList()) }
            try {
                val clients = repository.clients()
                if (mutableState.value.collector?.uid == uid) {
                    mutableState.update { it.copy(clients = clients, loadingClients = false) }
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                mutableState.update { it.copy(loadingClients = false,
                    clientError = "Unable to load clients. Check your connection or contact your administrator.") }
            }
        }
    }

    fun openPayment(client: Client) {
        if (mutableState.value.payment?.saving == true) return
        mutableState.update { it.copy(payment = PaymentUiState(client), notice = null) }
        reloadBalance(client.id)
    }

    fun reloadBalance(clientId: String) {
        viewModelScope.launch {
            try {
                val balance = repository.balance(clientId)
                mutableState.update { state ->
                    if (state.payment?.client?.id == clientId)
                        state.copy(payment = state.payment.copy(balance = balance, loading = false, error = null))
                    else state
                }
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (_: Exception) {
                mutableState.update { state ->
                    if (state.payment?.client?.id == clientId)
                        state.copy(payment = state.payment.copy(loading = false, error = "Unable to load balance. Check your connection and retry."))
                    else state
                }
            }
        }
    }

    fun paymentAmount(value: String) {
        mutableState.update { state ->
            val payment = state.payment ?: return@update state
            if (payment.saving || payment.submitted) state else state.copy(payment = payment.copy(amount = value, error = null))
        }
    }

    fun closePayment() {
        if (mutableState.value.payment?.saving != true) mutableState.update { it.copy(payment = null) }
    }

    fun savePayment() {
        val payment = mutableState.value.payment ?: return
        val uid = mutableState.value.collector?.uid ?: return
        if (payment.saving || payment.balance == null) return
        val amount = try {
            parsePayment(payment.amount).also {
                if (!payment.submitted) validatePayment(it, payment.balance, payment.date)
            }
        } catch (error: IllegalArgumentException) {
            mutableState.update { it.copy(payment = payment.copy(error = error.message)) }
            return
        }
        mutableState.update { it.copy(payment = payment.copy(saving = true, submitted = true, error = null)) }
        viewModelScope.launch {
            try {
                repository.savePayment(payment.receiptId, payment.client.id, amount, payment.date)
                if (mutableState.value.collector?.uid != uid) return@launch
                // Commit was acknowledged: show the new balance even if the next read fails.
                val updated = payment.balance.copy(totalPaid = payment.balance.totalPaid + amount,
                    paidToday = payment.balance.paidToday + amount)
                mutableState.update { it.copy(payment = payment.copy(balance = updated, amount = "",
                    receiptId = java.util.UUID.randomUUID().toString(), saving = false, submitted = false),
                    notice = "Payment saved: ${money(amount)}. Receipt: ${payment.receiptId}") }
                reloadBalance(payment.client.id)
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (error: Exception) {
                val validationError = error as? IllegalArgumentException
                if (mutableState.value.collector?.uid == uid) mutableState.update {
                    it.copy(payment = payment.copy(saving = false, submitted = validationError == null,
                        error = validationError?.message
                            ?: "Payment was not confirmed. Check your connection and retry this same payment."))
                }
            }
        }
    }

    fun signOut() {
        clientJob?.cancel()
        mutableState.value = CollectorUiState(checking = false)
        repository.signOut()
    }
}
