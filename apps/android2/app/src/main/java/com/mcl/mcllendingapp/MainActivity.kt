package com.mcl.mcllendingapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import com.mcl.mcllendingapp.domain.repository.AdminRepository
import com.mcl.mcllendingapp.presentation.navigation.RootScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity:ComponentActivity(){
    @Inject lateinit var repository:AdminRepository

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState:Bundle?){
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent{RootScreen(calculateWindowSizeClass(this))}
    }
    override fun onStart(){super.onStart();repository.setForeground(true)}
    override fun onStop(){repository.setForeground(false);super.onStop()}
}
