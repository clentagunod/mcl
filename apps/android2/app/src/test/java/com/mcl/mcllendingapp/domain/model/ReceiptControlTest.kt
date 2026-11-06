package com.mcl.mcllendingapp.domain.model

import org.junit.Assert.*
import org.junit.Test

class ReceiptControlTest {
    @Test fun sharedRulesControlEnablesFinancialWrites() {
        ReceiptControl.requireEnabled(mapOf("enabled" to true, "mode" to "ledger-v1"))
    }

    @Test fun missingControlReportsSetupRatherThanMaintenance() {
        val error = assertThrows(IllegalStateException::class.java) { ReceiptControl.requireEnabled(null) }
        assertTrue(error.message!!.contains("missing"))
    }

    @Test fun disabledControlRemainsDisabled() {
        val error = assertThrows(IllegalStateException::class.java) {
            ReceiptControl.requireEnabled(mapOf("enabled" to false, "mode" to "ledger-v1"))
        }
        assertTrue(error.message!!.contains("disabled"))
    }

    @Test fun malformedOrWrongProtocolCannotBeEnabledAccidentally() {
        listOf(
            emptyMap<String, Any?>(),
            mapOf("enabled" to "true", "mode" to "ledger-v1"),
            mapOf("enabled" to 1, "mode" to "ledger-v1"),
            mapOf("enabled" to true, "mode" to "legacy"),
            mapOf("enabled" to true)
        ).forEach { fields ->
            val error = assertThrows(IllegalStateException::class.java) { ReceiptControl.requireEnabled(fields) }
            assertTrue(error.message!!.contains("invalid"))
        }
    }
}
