package com.mcl.mcllendingapp.domain.model

data class PrintSelection(
    val ids: Set<String> = emptySet(),
    val matchingQueries: Set<String> = emptySet(),
    val excludedIds: Set<String> = emptySet(),
    val overrides: List<PrintSelectionOverride> = emptyList(),
    val bulk: Boolean = false
) {
    val explicitIds: Set<String> get() = ids + overrides.filter { it.selected }.mapNotNull { it.clientId }
    val hasQuerySelection: Boolean get() = matchingQueries.isNotEmpty() || overrides.any { it.query != null && it.selected }

    fun includes(client: Client): Boolean {
        var selected = client.id !in excludedIds && (client.id in ids || matchingQueries.any { PrintClientSearch.matches(client, it) })
        overrides.forEach { rule ->
            if (rule.clientId == client.id || (rule.query != null && PrintClientSearch.matches(client, rule.query))) selected = rule.selected
        }
        return selected
    }

    fun coversQuery(query: String): Boolean {
        var selected = matchingQueries.any { broader(it, query) }
        overrides.forEach { rule ->
            if (rule.query != null && broader(rule.query, query)) selected = rule.selected
            else if (!rule.selected && ((rule.clientId != null && matches(query, rule.clientSearchText)) || rule.query != null)) selected = false
        }
        return selected
    }

    fun searchText(client: Client): String = PrintClientSearch.searchText(client)
    fun matches(query: String, text: String): Boolean = PrintClientSearch.matchesText(query, text)
    private fun broader(rule: String, query: String): Boolean = PrintClientSearch.normalize(rule).split(" ").filter(String::isNotBlank).all(PrintClientSearch.normalize(query)::contains)
}
