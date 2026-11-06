package com.mcl.mcllendingapp.domain.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrintSelectionTest {
    private val jose = Client(id = "legacy-id", firstName = "José", middleName = "Dela", lastName = "Cruz", clientNumber = "mcl0001", transactionNumber = "00001")
    private val ana = Client(id = "ana", firstName = "Ana", lastName = "Ramos", clientNumber = "mcl0002")

    @Test fun searchMatchesAccentInsensitiveWordsInAnyOrderAndIdentifiers() {
        assertTrue(PrintSelection(matchingQueries = setOf("CRUZ JOSE")).includes(jose))
        assertTrue(PrintSelection(matchingQueries = setOf("mcl0001")).includes(jose))
        assertTrue(PrintSelection(matchingQueries = setOf("legacy id")).includes(jose))
        assertFalse(PrintSelection(matchingQueries = setOf("jose ramos")).includes(jose))
    }

    @Test fun bulkQueriesPreserveExplicitSelectionsOutsideResults() {
        val selection = PrintSelection(ids = setOf(ana.id), matchingQueries = setOf("jose"), bulk = true)
        assertTrue(selection.includes(jose))
        assertTrue(selection.includes(ana))
    }

    @Test fun deselectionOverridesSelectAllAndExplicitSelection() {
        val selection = PrintSelection(ids = setOf(jose.id), matchingQueries = setOf(""), excludedIds = setOf(jose.id), bulk = true)
        assertFalse(selection.includes(jose))
        assertTrue(selection.includes(ana))
    }

    @Test fun queryDeselectionAndLaterIndividualSelectionPreserveOtherClients() {
        val selected = PrintSelection(matchingQueries = setOf(""), overrides = listOf(
            PrintSelectionOverride(false, query = "jose"),
            PrintSelectionOverride(true, clientId = jose.id, clientSearchText = "José Dela Cruz")
        ), bulk = true)
        assertTrue(selected.includes(jose))
        assertTrue(selected.includes(ana))
        val deselected = selected.copy(overrides = selected.overrides + PrintSelectionOverride(false, query = "jose"))
        assertFalse(deselected.includes(jose))
        assertTrue(deselected.includes(ana))
    }

    @Test fun nonLatinQueryDoesNotBecomeAnEmptySelectAllQuery() {
        val selection = PrintSelection(matchingQueries = setOf("李"), bulk = true)
        assertTrue(selection.includes(Client(id = "li", firstName = "李", lastName = "王")))
        assertFalse(selection.includes(jose))
        assertFalse(selection.includes(ana))
    }

    @Test fun selectingNoClientsDoesNotImplicitlySelectTheFirstPage() {
        assertFalse(PrintSelection(bulk = true).includes(jose))
        assertTrue(PrintSelection(matchingQueries = setOf("")).includes(jose))
    }
}
