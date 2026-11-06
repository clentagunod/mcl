package com.mcl.mcllendingapp.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PrintClientSearchTest {
    private val borrower = Client(id = "legacy-123", firstName = "Juán", middleName = "José", lastName = "Dela Cruz",
        clientNumber = "mcl-0001", transactionNumber = "00017", address = "Market Street", cellphone = "09123456789")

    @Test fun partialNameWordsIgnoreOrderAccentsAndPunctuationWithoutSearchingAddressOrPhone() {
        assertTrue(PrintClientSearch.matches(borrower, "cruz ju"))
        assertTrue(PrintClientSearch.matches(borrower, "JOSE, dela"))
        assertFalse(PrintClientSearch.matches(borrower, "Market"))
        assertFalse(PrintClientSearch.matches(borrower, "09123456789"))
    }

    @Test fun compactSurnamesAndSpacedIdentifiersMatchTheSameBulkExportSelection() {
        assertTrue(PrintClientSearch.matches(borrower, "delacruz"))
        assertTrue(PrintClientSearch.matches(borrower, "mcl 00-01"))
        assertTrue(PrintSelection(matchingQueries = setOf("delacruz")).includes(borrower))
        assertTrue(PrintSelection(matchingQueries = setOf("mcl 00-01")).includes(borrower))
        assertFalse(PrintSelection(matchingQueries = setOf("delacruz")).includes(Client(id = "other", lastName = "Ramos")))
    }

    @Test fun exactIdentifiersPrecedeExactNamesPrefixesAndOtherPartialMatches() {
        assertEquals(0, PrintClientSearch.rank(borrower, "mcl0001"))
        assertEquals(1, PrintClientSearch.rank(borrower, "dela cruz juan jose"))
        assertEquals(2, PrintClientSearch.rank(borrower, "mcl"))
        assertEquals(3, PrintClientSearch.rank(borrower, "dela"))
        assertEquals(4, PrintClientSearch.rank(borrower, "jose"))
        assertNull(PrintClientSearch.rank(borrower, "ramos"))
    }
}
