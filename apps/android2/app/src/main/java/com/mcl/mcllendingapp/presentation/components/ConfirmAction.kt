package com.mcl.mcllendingapp.presentation.components

import androidx.compose.material3.*
import androidx.compose.runtime.Composable

@Composable
fun ConfirmAction(title: String, message: String, confirmLabel: String, busy: Boolean = false,
    onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, title = { Text(title) },
        text = { Text(message) }, confirmButton = { TextButton(onClick = onConfirm, enabled = !busy) { Text(if(busy) "Please wait…" else confirmLabel) } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("Cancel") } })
}
