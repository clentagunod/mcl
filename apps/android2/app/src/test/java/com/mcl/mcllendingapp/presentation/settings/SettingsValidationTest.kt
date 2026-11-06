package com.mcl.mcllendingapp.presentation.settings

import com.mcl.mcllendingapp.domain.model.AppSettings
import org.junit.Assert.*
import org.junit.Test

class SettingsValidationTest {
    private val defaults = AppSettings()

    @Test fun defaultSettingsRoundTrip() {
        val result = validateSettingsValues(settingsValues(defaults), defaults)
        assertTrue(result.errors.isEmpty())
        assertEquals(defaults, result.value)
    }

    @Test fun rejectsInvalidClientIdPrefixAndDashboardLimits() {
        val values = settingsValues(defaults) + mapOf("general.clientIdPrefix" to "123", "general.dueClientsLimit" to "0")
        val result = validateSettingsValues(values, defaults)
        assertTrue(result.errors.containsKey("general.clientIdPrefix"))
        assertTrue(result.errors.containsKey("general.dueClientsLimit"))
    }

    @Test fun rejectsNonFiniteDimensionsAndUnsupportedFontSteps() {
        val values = settingsValues(defaults) + mapOf("studio.index.widthMm" to "Infinity", "studio.summary.fontSize" to "9.1")
        val result = validateSettingsValues(values, defaults)
        assertTrue(result.errors.containsKey("studio.index.widthMm"))
        assertTrue(result.errors.containsKey("studio.summary.fontSize"))
    }

    @Test fun rejectsUnsupportedRetentionAndInvalidColor() {
        val values = settingsValues(defaults) + mapOf("trash.autoDeleteDays" to "1", "index.headingColor" to "red")
        val result = validateSettingsValues(values, defaults)
        assertTrue(result.errors.containsKey("trash.autoDeleteDays"))
        assertTrue(result.errors.containsKey("index.headingColor"))
    }

    @Test fun acceptsFinancialPolicyAndAllowedRetentionWithoutChangingLoanMath() {
        val values = settingsValues(defaults) + mapOf("payments.enforceDailyMinimum" to "true", "trash.autoDeleteDays" to "7", "index.amountBasis" to "principal")
        val result = validateSettingsValues(values, defaults)
        assertTrue(result.errors.isEmpty())
        assertEquals(true, result.value!!.payments.enforceDailyMinimum)
        assertEquals(7, result.value.trash.autoDeleteDays)
        assertEquals("principal", result.value.index.amountBasis)
    }
}
