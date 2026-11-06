package com.mcl.mcllendingapp.presentation.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.mcl.mcllendingapp.domain.model.LoadState
import com.mcl.mcllendingapp.ui.theme.AppSpacing

@Composable
fun ScreenStatus(loading: Boolean, error: String?, empty: Boolean = false,
    onRetry: () -> Unit, emptyText: String = "No records yet.", content: @Composable () -> Unit) {
    val status: LoadState<Unit> = when {
        loading -> LoadState.Loading
        empty && error != null -> LoadState.Error(error)
        empty -> LoadState.Empty
        else -> LoadState.Success(Unit)
    }
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(AppSpacing.small)) {
        if (error != null) {
            Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium) {
                Column(Modifier.fillMaxWidth().padding(AppSpacing.medium)) {
                    Text(error, color = MaterialTheme.colorScheme.onErrorContainer)
                    TextButton(onClick = onRetry) { Text("Retry") }
                }
            }
        }
        when(status) {
            LoadState.Loading -> { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("Loading records…") }
            LoadState.Empty -> Text(emptyText, Modifier.padding(AppSpacing.medium))
            is LoadState.Error -> Unit
            is LoadState.Success -> content()
        }
    }
}
