package com.mcl.mcllendingapp.presentation

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.model.Client
import com.mcl.mcllendingapp.domain.model.LoanMath
import com.mcl.mcllendingapp.domain.model.SyncState
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import com.mcl.mcllendingapp.domain.usecase.auth.*
import com.mcl.mcllendingapp.domain.usecase.clients.*
import com.mcl.mcllendingapp.domain.usecase.payments.*
import com.mcl.mcllendingapp.domain.usecase.renewal.*
import com.mcl.mcllendingapp.domain.usecase.settings.ObserveSettingsUseCase
import com.mcl.mcllendingapp.presentation.clients.*
import com.mcl.mcllendingapp.presentation.payments.*
import com.mcl.mcllendingapp.presentation.renewal.*
import java.lang.reflect.Proxy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FormDraftRestorationTest {
    private val models=mutableListOf<ViewModel>()
    private val repository=Proxy.newProxyInstance(AdminRepository::class.java.classLoader,arrayOf(AdminRepository::class.java)) { _, method, _ ->
        throw UnsupportedOperationException("Unexpected repository access: "+method.name)
    } as AdminRepository

    @Before fun setup() { Dispatchers.setMain(StandardTestDispatcher()) }
    @After fun cleanup() { models.forEach{it.viewModelScope.cancel()};Dispatchers.resetMain() }

    @Test fun newClientDraftSurvivesRecreationWithoutRestoringWritePermission() {
        val saved=SavedStateHandle()
        val model=client(saved)
        model.onEvent(ClientFormEvent.Field("firstName","Maria"))
        model.onEvent(ClientFormEvent.Field("principal","15000"))
        model.onEvent(ClientFormEvent.Term(58))
        val restored=client(recreated(saved)).uiState.value
        assertEquals("Maria",restored.draft.firstName)
        assertEquals("15000",restored.draft.principal)
        assertEquals(58,restored.draft.term)
        assertFalse(restored.canWrite)
        assertFalse(restored.busy)
    }

    @Test fun editedClientKeepsOriginalConflictRevisionWhenRestoringDraft() {
        val original=Client(id="client",firstName="Original",revision="opened-revision",activeLoanId="loan-1")
        val saved=SavedStateHandle(mapOf("clientId" to original.id,"formDraft" to Json.encodeToString(
            SavedLoanDraft(ClientDraft(firstName="Original"),original))))
        val model=client(saved)
        model.onEvent(ClientFormEvent.Field("firstName","Edited"))
        val restored=client(recreated(saved)).uiState.value
        assertEquals("Edited",restored.draft.firstName)
        assertEquals("opened-revision",restored.original?.revision)
        assertEquals("loan-1",restored.original?.activeLoanId)
        assertFalse(restored.loading)
    }

    @Test fun renewalTermsAndNotesSurviveButApprovalRequiresReviewAgain() {
        val saved=SavedStateHandle(mapOf("clientId" to "client"))
        val model=renewal(saved)
        model.onEvent(RenewalEvent.Field("principal","25000"))
        model.onEvent(RenewalEvent.Notes("Reviewed settlement"))
        model.onEvent(RenewalEvent.Reviewed(true))
        val restored=renewal(recreated(saved)).uiState.value
        assertEquals("25000",restored.draft.principal)
        assertEquals("Reviewed settlement",restored.notes)
        assertFalse(restored.reviewed)
        assertFalse(restored.canWrite)
    }

    @Test fun paymentDraftAndOpenFormSurviveWithoutAssumingReceiptCommitted() {
        val saved=SavedStateHandle(mapOf("clientId" to "client"))
        val model=payments(saved)
        model.onEvent(PaymentsEvent.Field("amount","275.50"))
        model.onEvent(PaymentsEvent.Field("date","2026-11-04"))
        model.onEvent(PaymentsEvent.Field("notes","Cash collected"))
        model.onEvent(PaymentsEvent.ShowForm)
        val restored=payments(recreated(saved)).uiState.value
        assertEquals("275.50",restored.amount)
        assertEquals("2026-11-04",restored.date)
        assertEquals("Cash collected",restored.notes)
        assertTrue(restored.showForm)
        assertFalse(restored.canWrite)
        assertTrue(restored.pending.isEmpty())
    }

    @Test fun unavailableEditCannotCreateANewBorrower() = runTest {
        var saves=0
        val fake=Proxy.newProxyInstance(AdminRepository::class.java.classLoader,arrayOf(AdminRepository::class.java)) { _, method, _ ->
            when(method.name) {
                "observeClient" -> flowOf<Client?>(null)
                "getSyncState" -> MutableStateFlow(SyncState(complete=true,fresh=true))
                "saveClient" -> { saves++;Unit }
                else -> throw UnsupportedOperationException(method.name)
            }
        } as AdminRepository
        val model=client(SavedStateHandle(mapOf("clientId" to "deleted")),fake)
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { model.uiState.collect{} }
        runCurrent()
        assertTrue(model.uiState.value.editing)
        assertFalse(model.uiState.value.loading)
        assertFalse(model.uiState.value.canWrite)
        mapOf("firstName" to "Maria","lastName" to "Santos","address" to "Manila",
            "cellphone" to "09171234567","principal" to "1000","interest" to "100",
            "daily" to "25","approval" to LoanMath.today()).forEach{(key,value) ->
            model.onEvent(ClientFormEvent.Field(key,value))
        }
        model.onEvent(ClientFormEvent.Save)
        runCurrent()
        assertEquals(0,saves)
    }

    private fun recreated(saved:SavedStateHandle)=SavedStateHandle(saved.keys().associateWith{saved.get<Any?>(it)})
    private fun client(saved:SavedStateHandle,repository:AdminRepository=this.repository)=ClientFormViewModel(saved,ObserveClientUseCase(repository),
        ObserveSyncUseCase(repository),SaveClientUseCase(repository)).also{models.add(it)}
    private fun renewal(saved:SavedStateHandle)=RenewalViewModel(saved,ObserveClientUseCase(repository),
        ObserveSyncUseCase(repository),GetRenewalEligibilityUseCase(repository),GrantRenewalUseCase(repository)).also{models.add(it)}
    private fun payments(saved:SavedStateHandle)=PaymentsViewModel(saved,ObserveClientUseCase(repository),
        ObservePaymentsUseCase(repository),ObservePendingReceiptsUseCase(repository),ObserveSettingsUseCase(repository),
        ObserveSyncUseCase(repository),ObserveSessionUseCase(repository),ReservePaymentUseCase(repository),
        SubmitPaymentUseCase(repository),DeletePaymentUseCase(repository),RefreshUseCase(repository)).also{models.add(it)}
}
