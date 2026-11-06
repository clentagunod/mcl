package com.mcl.mcllendingapp.ui.theme

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ThemePreferences @Inject constructor(@ApplicationContext context: Context) {
    private val preferences = context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
    private val mutable = MutableStateFlow(preferences.getString("theme", "system") ?: "system")
    val mode = mutable.asStateFlow()
    fun setMode(mode: String) {
        require(mode in setOf("system", "light", "dark"))
        preferences.edit().putString("theme", mode).apply()
        mutable.value = mode
    }
}
