package com.mcl.mcllendingapp.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun CollectorApp(state: CollectorUiState, model: CollectorViewModel) {
    state.payment?.let { PaymentDialog(it, state.notice, model) }
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding).imePadding(), contentAlignment = Alignment.Center) {
            when {
                state.checking -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Text("Verifying collector access…", Modifier.padding(16.dp))
                    TextButton(onClick = model::signOut) { Text("Return to sign in") }
                }
                state.collector == null -> Login(state, model::signIn)
                else -> ClientSearch(state, model)
            }
        }
    }
}

@Composable
private fun Login(state: CollectorUiState, signIn: (String, String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    // Password is intentionally not saved to instance state.
    var password by remember { mutableStateOf("") }
    Column(Modifier.widthIn(max = 440.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)) {
        Surface(shape = RoundedCornerShape(6.dp), border = BorderStroke(1.dp, Color(0xFFD9DDE3))) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("MCL Lending", style = MaterialTheme.typography.headlineSmall)
                Text("Collector sign in", color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                OutlinedTextField(email, { email = it }, label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !state.busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next))
                OutlinedTextField(password, { password = it }, label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true, enabled = !state.busy,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = {
                        if (!state.busy && email.isNotBlank() && password.isNotBlank()) signIn(email, password)
                    }))
                Button(onClick = { signIn(email, password) },
                    enabled = !state.busy && email.isNotBlank() && password.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(6.dp)) {
                    Text(if (state.busy) "Signing in…" else "Sign in")
                }
            }
        }
    }
}

@Composable
private fun ClientSearch(state: CollectorUiState, model: CollectorViewModel) {
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("MCL Lending", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = model::signOut) { Text("Sign out") }
        }
        Text(state.collector?.fullName.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(state.query, model::search, label = { Text("Search clients by name") },
            singleLine = true, modifier = Modifier.fillMaxWidth(),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search))
        when {
            state.loadingClients -> CircularProgressIndicator()
            state.clientError != null -> {
                Text(state.clientError, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = model::refresh) { Text("Retry") }
            }
            else -> {
                TextButton(onClick = model::refresh) { Text("Refresh clients") }
                val results = state.results
                when {
                    state.query.isBlank() -> Text("Enter a client’s name to search.")
                    results.isEmpty() -> Text("No matching clients.")
                    else -> {
                        Text("${results.size} matching clients")
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(results, key = { it.id }) { client ->
                                Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(6.dp),
                                    border = BorderStroke(1.dp, Color(0xFFD9DDE3))) {
                                    Column(Modifier.padding(16.dp)) {
                                        Text(client.displayName, style = MaterialTheme.typography.titleMedium)
                                        Text("Client ID: ${client.id}", style = MaterialTheme.typography.bodySmall)
                                        Button(onClick = { model.openPayment(client) }) { Text("Record payment") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
