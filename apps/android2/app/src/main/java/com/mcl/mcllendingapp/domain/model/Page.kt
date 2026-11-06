package com.mcl.mcllendingapp.domain.model

data class Page<T>(val items: List<T> = emptyList(), val total: Int = 0,
    val page: Int = 0, val pageSize: Int = 25, val fresh: Boolean = false,
    val counts: Map<String, Int> = emptyMap(),
    val totals: Map<String, Double> = emptyMap()) {
    val hasMore: Boolean get() = (page + 1) * pageSize < total
    val nextPage: Int? get() = if (hasMore) page + 1 else null
}
