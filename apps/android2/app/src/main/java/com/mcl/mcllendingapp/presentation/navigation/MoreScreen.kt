package com.mcl.mcllendingapp.presentation.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mcl.mcllendingapp.ui.theme.AppSpacing

@Composable
fun MoreScreen(onAccounts:()->Unit,onHolidays:()->Unit,onSettings:()->Unit,onTrash:()->Unit,viewModel:MoreViewModel=hiltViewModel()){
    val s by viewModel.uiState.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(AppSpacing.medium),
        verticalArrangement=Arrangement.spacedBy(AppSpacing.medium)){
        Text("More",style=MaterialTheme.typography.headlineMedium)
        Text(s.name,style=MaterialTheme.typography.titleLarge);Text("${s.email} · ${s.role}")
        s.error?.let{Text(it,color=MaterialTheme.colorScheme.error)}
        if(s.role in setOf("admin","developer")) listOf("Collectors & Admins" to onAccounts,"Holidays" to onHolidays,"Settings" to onSettings,"Trash" to onTrash)
            .forEach{(label,action)->OutlinedButton(onClick=action,modifier=Modifier.fillMaxWidth()){Text(label)}}
        Text("Appearance",style=MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement=Arrangement.spacedBy(AppSpacing.small)){
            listOf("system","light","dark").forEach{mode->FilterChip(s.theme==mode,{viewModel.onEvent(MoreEvent.Theme(mode))},label={Text(mode.replaceFirstChar(Char::uppercase))})}}
        Button(onClick={viewModel.onEvent(MoreEvent.SignOut)}){Text("Sign out")}
        Text("MCL Lending · Lending administration",style=MaterialTheme.typography.labelMedium)
    }
}
