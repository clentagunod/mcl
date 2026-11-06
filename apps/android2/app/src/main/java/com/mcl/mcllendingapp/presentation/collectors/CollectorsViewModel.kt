package com.mcl.mcllendingapp.presentation.collectors

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.AccountInput
import com.mcl.mcllendingapp.domain.model.ListQuery
import com.mcl.mcllendingapp.domain.model.Page
import com.mcl.mcllendingapp.domain.model.UserAccount
import com.mcl.mcllendingapp.domain.usecase.accounts.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Manages bounded account pages and explicitly confirmed team account changes. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class CollectorsViewModel @Inject constructor(
    observeAccounts: ObserveAccountsUseCase,
    session: GetManagementSessionUseCase,
    private val createAccount: CreateAccountUseCase,
    private val saveAccount: SaveAccountUseCase,
    private val setActive: SetAccountActiveUseCase,
    private val deleteAccount: DeleteAccountUseCase,
    private val resetPassword: ResetAccountPasswordUseCase,
) : ViewModel() {
    private val local = MutableStateFlow(CollectorsUiState())
    private val query = MutableStateFlow(ListQuery(pageSize = 10))
    private val refresh = MutableStateFlow(0)
    private val feed = combine(query, refresh) { value, _ -> value }.flatMapLatest { value ->
        observeAccounts(value)
            .map<Page<UserAccount>, Pair<Page<UserAccount>?, String?>> { it to null }
            .onStart { emit(null to null) }
            .catch { emit(null to (it.message ?: "Accounts could not load.")) }
    }
    val uiState: StateFlow<CollectorsUiState> = combine(local, query, feed, session()) { draft, request, result, account ->
        draft.copy(
            loading = result.first == null && result.second == null,
            page = result.first ?: Page(emptyList(), 0, request.page, request.pageSize, false),
            error = draft.error ?: result.second,
            search = request.search, role = request.role, status = request.status, sort = request.sort,
            currentUserId = account.account?.uid.orEmpty(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(), CollectorsUiState())

    fun onEvent(event: CollectorsEvent) {
        when (event) {
            is CollectorsEvent.Search -> changeQuery { copy(search = event.value, page = 0) }
            is CollectorsEvent.FilterRole -> changeQuery { copy(role = event.value, page = 0) }
            is CollectorsEvent.FilterStatus -> changeQuery { copy(status = event.value, page = 0) }
            is CollectorsEvent.Sort -> changeQuery { copy(sort = event.value, page = 0) }
            is CollectorsEvent.PageSize -> changeQuery { copy(pageSize = event.value, page = 0) }
            CollectorsEvent.NextPage -> if (uiState.value.page.hasMore) changeQuery { copy(page = uiState.value.page.page + 1) }
            CollectorsEvent.PreviousPage -> changeQuery { copy(page = (uiState.value.page.page - 1).coerceAtLeast(0)) }
            CollectorsEvent.Retry -> { local.update { it.copy(error = null) }; refresh.update { it + 1 } }
            is CollectorsEvent.Add -> local.update { it.copy(draft = AccountDraft(role = event.role), fieldErrors = emptyMap(), error = null) }
            is CollectorsEvent.Edit -> local.update { it.copy(draft = AccountDraft(event.account.uid, event.account.role, event.account.fullName, event.account.email, event.account.phone), fieldErrors = emptyMap(), error = null) }
            is CollectorsEvent.Draft -> local.update { it.copy(draft = event.value, fieldErrors = emptyMap(), error = null) }
            CollectorsEvent.Save -> save()
            is CollectorsEvent.Confirm -> local.update { it.copy(pendingAccount = event.account, pendingOperation = event.operation, error = null) }
            CollectorsEvent.Execute -> execute()
            CollectorsEvent.Dismiss -> if (!local.value.busy) local.update { it.copy(draft = null, pendingAccount = null, pendingOperation = null, fieldErrors = emptyMap(), error = null) }
        }
    }

    private fun changeQuery(change: ListQuery.() -> ListQuery) {
        query.update(change)
        local.update { it.copy(error = null) }
    }

    private fun save() {
        val input = local.value.draft ?: return
        if (!uiState.value.page.fresh) { local.update { it.copy(error = "Wait for server confirmation before changing accounts.") }; return }
        if (local.value.busy) return
        val errors = buildMap {
            if (input.fullName.isBlank()) put("fullName", "Full name is required.")
            if (input.phone.isNotBlank() && !Regex("^(09\\d{9}|\\+639\\d{9})$").matches(input.phone.replace(Regex("[\\s()\\-]"), ""))) put("phone", "Use 09171234567 or +639171234567.")
            if (input.uid == null && !Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(input.email.trim())) put("email", "Enter a valid login email.")
            if (input.uid == null && input.password.length < 8) put("password", "Use at least 8 characters.")
        }
        if (errors.isNotEmpty()) { local.update { it.copy(fieldErrors = errors) }; return }
        val name = input.fullName.trim().replace(Regex("\\s+"), " ")
        val phone = input.phone.replace(Regex("[\\s()\\-]"), "")
        runAction("Account saved.") {
            if (input.uid == null) createAccount(AccountInput(input.role, name, input.email.trim().lowercase(), phone, input.password))
            else {
                val original = uiState.value.page.items.find { it.uid == input.uid } ?: error("Account changed. Reload and open it again.")
                saveAccount(original.copy(fullName = name, phone = phone))
            }
        }
    }

    private fun execute() {
        val account = local.value.pendingAccount ?: return
        if (!uiState.value.page.fresh) { local.update { it.copy(error = "Wait for server confirmation before changing accounts.") }; return }
        val operation = local.value.pendingOperation ?: return
        if (operation in listOf("toggle", "delete") && account.uid == uiState.value.currentUserId) {
            local.update { it.copy(error = "You cannot delete or deactivate your own account.") }
            return
        }
        runAction(if (operation == "reset") "Password reset email sent to " + account.email + "." else "Account updated.") {
            when (operation) {
                "toggle" -> setActive(account.uid, !account.active)
                "reset" -> resetPassword(account.email)
                "delete" -> deleteAccount(account.uid)
                else -> error("Choose an account action.")
            }
        }
    }

    private fun runAction(message: String, action: suspend () -> Unit) {
        if (local.value.busy) return
        viewModelScope.launch {
            local.update { it.copy(busy = true, error = null, message = null) }
            try {
                action()
                local.update { it.copy(busy = false, draft = null, pendingAccount = null, pendingOperation = null, message = message) }
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                local.update { it.copy(busy = false, error = error.message ?: "The account change failed. Try again.") }
            }
        }
    }
}
