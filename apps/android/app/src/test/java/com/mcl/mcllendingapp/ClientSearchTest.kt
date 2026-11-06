package com.mcl.mcllendingapp

import com.mcl.mcllendingapp.data.Client
import com.mcl.mcllendingapp.ui.CollectorUiState
import org.junit.Assert.*
import org.junit.Test

class ClientSearchTest {
    private val client = Client("client-1", "Maria", "", "Santos")

    @Test fun searchHandlesCaseSpacingAndReversedNames() {
        assertTrue(client.matches("  SANTOS   maria "))
        assertTrue(client.matches("Mari"))
        assertFalse(client.matches("Maria Cruz"))
    }

    @Test fun blankSearchDoesNotExposeClientList() {
        assertTrue(CollectorUiState(clients = listOf(client), query = " ").results.isEmpty())
    }

    @Test fun duplicateNamesKeepDistinctClientIdentifiers() {
        val other = client.copy(id = "client-2")
        val results = CollectorUiState(clients = listOf(client, other), query = "Santos").results
        assertEquals(listOf("client-1", "client-2"), results.map { it.id })
    }
}
