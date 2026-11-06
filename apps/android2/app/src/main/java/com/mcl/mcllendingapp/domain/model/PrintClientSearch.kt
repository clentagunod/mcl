package com.mcl.mcllendingapp.domain.model

import java.text.Normalizer
import java.util.Locale

object PrintClientSearch {
    private val marks = Regex("\\p{M}+")
    private val punctuation = Regex("[^\\p{L}\\p{N}]+")
    private val whitespace = Regex("\\s+")

    fun normalize(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFD)
        .replace(marks, "").lowercase(Locale.ROOT).replace(punctuation, " ").trim().replace(whitespace, " ")

    fun summaryName(client: Client): String = client.lastName + ", " + client.firstName +
        if (client.middleName.isBlank()) "" else " " + client.middleName

    fun searchText(client: Client): String = summaryName(client) + " " +
        listOf(client.id, client.clientNumber.ifBlank { client.id }, client.transactionNumber).joinToString(" ")

    fun matches(client: Client, query: String): Boolean = rank(client, query) != null

    fun rank(client: Client, query: String): Int? {
        val normalized = normalize(query)
        val compact = normalized.replace(" ", "")
        val tokens = normalized.split(" ").filter(String::isNotBlank)
        val name = normalize(summaryName(client))
        val identifiers = listOf(client.id, client.clientNumber.ifBlank { client.id }, client.transactionNumber)
            .map { normalize(it).replace(" ", "") }.filter(String::isNotBlank)
        val haystack = name + " " + identifiers.joinToString(" ")
        if (tokens.isNotEmpty() && !tokens.all(haystack::contains) &&
            !name.replace(" ", "").contains(compact) && identifiers.none { it.contains(compact) }) return null
        return when {
            compact.isBlank() || compact in identifiers -> 0
            name == normalized -> 1
            identifiers.any { it.startsWith(compact) } -> 2
            name.startsWith(normalized) -> 3
            else -> 4
        }
    }

    fun matchesText(query: String, text: String): Boolean {
        val normalized = normalize(query)
        val haystack = normalize(text)
        return normalized.split(" ").filter(String::isNotBlank).all(haystack::contains) ||
            haystack.replace(" ", "").contains(normalized.replace(" ", ""))
    }
}
