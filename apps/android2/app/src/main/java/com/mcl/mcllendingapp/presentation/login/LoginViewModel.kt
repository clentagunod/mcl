package com.mcl.mcllendingapp.presentation.login

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import com.mcl.mcllendingapp.domain.usecase.auth.ConfigureFirebaseUseCase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mcl.mcllendingapp.domain.usecase.auth.SignInUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Holds the sign-in draft and waits for server-confirmed authorization. */
@HiltViewModel
class LoginViewModel @Inject constructor(private val signIn: SignInUseCase, private val configure: ConfigureFirebaseUseCase,
    @ApplicationContext private val context: Context): ViewModel() {
    private val mutable = MutableStateFlow(LoginUiState())
    val uiState = mutable.asStateFlow()
    fun onEvent(event: LoginEvent) {
        when(event) {
            is LoginEvent.Email -> mutable.update { it.copy(email=event.value,error=null) }
            is LoginEvent.Password -> mutable.update { it.copy(password=event.value,error=null) }
            is LoginEvent.ImportConfig -> viewModelScope.launch {
                mutable.update{it.copy(busy=true,error=null)}
                runCatching {
                    val json=withContext(Dispatchers.IO){
                        context.contentResolver.openInputStream(event.uri)?.use { input ->
                            val output=ByteArrayOutputStream()
                            val buffer=ByteArray(4096)
                            var count=input.read(buffer)
                            while(count>=0){
                                require(output.size()+count<=131072){"Configuration file is too large."}
                                output.write(buffer,0,count)
                                count=input.read(buffer)
                            }
                            output.toString("UTF-8")
                        } ?: error("The configuration file could not be opened.")
                    }
                    configure(json)
                }.onFailure{e->mutable.update{it.copy(error=e.message)}}
                mutable.update{it.copy(busy=false)}
            }
            LoginEvent.Submit -> {
                val draft = mutable.value
                if(draft.busy) return
                viewModelScope.launch {
                    mutable.update { it.copy(busy=true,error=null) }
                    runCatching { signIn(draft.email.trim(),draft.password) }.onSuccess { mutable.update { it.copy(password="") } }
                        .onFailure { e -> mutable.update { it.copy(error=e.message ?: "Sign-in failed.") } }
                    mutable.update { it.copy(busy=false) }
                }
            }
        }
    }
}
