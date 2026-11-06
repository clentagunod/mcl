package com.mcl.mcllendingapp.domain.model

object SettingsValidation {
    fun validate(settings: AppSettings) {
        val g = settings.general
        require(settings.trash.autoDeleteDays in listOf(0, 3, 7, 30)) { "Choose a supported Trash retention policy." }
        require(Regex("^[a-zA-Z][a-zA-Z0-9_-]{0,19}$").matches(g.clientIdPrefix)) { "Client prefix must begin with a letter and contain at most 20 letters, digits, underscores or hyphens." }
        require(g.clientIdDigits in 1..10) { "Client ID digits must be between 1 and 10." }
        require(g.recentPaymentsLimit in 1..100 && g.dueClientsLimit in 1..100) { "Dashboard limits must be between 1 and 100." }
        val text = listOf(g.businessName, g.defaultPaymentNote, settings.index.businessName,
            settings.index.branch, settings.index.mobile, settings.promissory.payee,
            settings.promissory.interestStatement, settings.promissory.executionPlace)
        require(text.all { it.isNotBlank() && it.length <= 1500 }) { "Complete text settings, up to 1,500 characters each." }
        require(settings.index.amountBasis in listOf("principal", "total")) { "Choose the index amount basis." }
        require(listOf(settings.index.headingColor, settings.index.cellColor).all { Regex("^#[a-fA-F0-9]{6}$").matches(it) }) { "Choose valid template colors." }
        require(settings.studio.keys.containsAll(listOf("index", "promissory", "summary"))) { "All three print layouts are required." }
        settings.studio.values.forEach { layout ->
            require(layout.paper in listOf("template", "a4", "letter", "legal", "custom")
                && layout.orientation in listOf("portrait", "landscape")
                && listOf(layout.widthMm, layout.heightMm).all { it.isFinite() && it in 70.0..600.0 }
                && layout.marginMm.isFinite() && layout.marginMm in 0.0..30.0
                && layout.fontSize.isFinite() && layout.fontSize in 6.0..18.0
                && layout.fontSize * 2 == kotlin.math.floor(layout.fontSize * 2)) {
                "Check paper dimensions, margins and font sizes." }
        }
    }
}
