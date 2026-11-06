package com.mcl.mcllendingapp.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StartupProfile {
    @get:Rule val profile = BaselineProfileRule()

    @Test
    fun startupAndNavigation() = profile.collect(
        packageName = "com.mcl.mcllendingapp",
        includeInStartupProfile = true
    ) {
        pressHome()
        startActivityAndWait()
        device.wait(Until.hasObject(By.pkg(packageName).depth(0)), 5_000)
        listOf("Clients", "Printables", "Ledger", "More", "Dashboard").forEach { label ->
            device.findObject(By.desc(label))?.click()
            device.waitForIdle()
        }
    }
}
