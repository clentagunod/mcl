package com.mcl.mcllendingapp.util.documents

enum class PrintDocumentKind(val title: String, val key: String) {
    INDEX("Index Card", "index"),
    PROMISSORY("Promissory Note", "promissory"),
    SUMMARY("Daily Summary Sheet", "summary")
}
