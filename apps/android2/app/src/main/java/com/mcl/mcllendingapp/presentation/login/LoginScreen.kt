package com.mcl.mcllendingapp.presentation.login

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.mcl.mcllendingapp.R
import com.mcl.mcllendingapp.ui.theme.*

@Composable
fun LoginScreen(accessError: String?, onTheme: () -> Unit, viewModel: LoginViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val importer=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->uri?.let{viewModel.onEvent(LoginEvent.ImportConfig(it))}}
    LoginContent(state, accessError, onTheme, viewModel::onEvent,onImport={importer.launch(arrayOf("application/json","text/plain","*/*"))})
}

@Composable
fun LoginContent(state: LoginUiState, accessError: String?, onTheme: () -> Unit, onEvent: (LoginEvent)->Unit,onImport:()->Unit={}) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding(), contentAlignment=Alignment.Center) {
        Column(Modifier.widthIn(max=AppDimensions.fieldMaxWidth).fillMaxWidth().verticalScroll(rememberScrollState())
            .padding(AppSpacing.large), verticalArrangement=Arrangement.spacedBy(AppSpacing.medium)) {
            AsyncImage(model=R.drawable.mcl_logo, contentDescription="MCL Lending", modifier=Modifier.size(AppDimensions.largeLogo).align(Alignment.CenterHorizontally))
            Text("MCL Lending", style=MaterialTheme.typography.headlineLarge)
            Text("Sign in to your lending workspace.", color=MaterialTheme.colorScheme.onSurfaceVariant)
            (state.error ?: accessError)?.let { Text(it, color=MaterialTheme.colorScheme.error) }
            OutlinedTextField(state.email,{ onEvent(LoginEvent.Email(it)) },label={ Text("Email") },
                modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=!state.busy,
                keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Email))
            OutlinedTextField(state.password,{ onEvent(LoginEvent.Password(it)) },label={ Text("Password") },
                modifier=Modifier.fillMaxWidth(),singleLine=true,enabled=!state.busy,
                visualTransformation=PasswordVisualTransformation(),
                keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Password))
            Button(onClick={ onEvent(LoginEvent.Submit) },enabled=!state.busy&&state.email.isNotBlank()&&state.password.isNotBlank(),
                modifier=Modifier.fillMaxWidth()) { Text(if(state.busy) "Signing in…" else "Sign in") }
            if(accessError?.contains("google-services.json",ignoreCase=true)==true)
                TextButton(onClick=onImport,enabled=!state.busy) { Text("Import Firebase configuration") }
            TextButton(onClick=onTheme) { Text("Change appearance") }
        }
    }
}
