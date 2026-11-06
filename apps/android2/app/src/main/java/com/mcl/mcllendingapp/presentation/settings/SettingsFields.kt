package com.mcl.mcllendingapp.presentation.settings

import com.mcl.mcllendingapp.domain.model.*

val settingsSections = listOf("general" to "General", "payments" to "Payment policy", "trash" to "Trash & retention", "index" to "Index card", "promissory" to "Promissory note", "studio" to "Print defaults")

fun settingFields(section: String): List<SettingField> = when (section) {
    "general" -> listOf(
        SettingField("general.businessName", "Workspace name", maxLength = 120),
        SettingField("general.clientIdPrefix", "Client ID prefix", hint = "Applies to future IDs. Existing numbers remain stable.", maxLength = 20),
        SettingField("general.clientIdDigits", "Client ID digits", "integer", hint = "1–10 digits"),
        SettingField("general.defaultPaymentNote", "Default payment note", maxLength = 500),
        SettingField("general.recentPaymentsLimit", "Dashboard recent payments", "integer", hint = "1–100"),
        SettingField("general.dueClientsLimit", "Dashboard due clients", "integer", hint = "1–100"),
    )
    "payments" -> listOf(SettingField("payments.enforceDailyMinimum", "Require collectors to meet the daily payable amount", "boolean", hint = "Applies to each receipt. Administrators may record smaller partial payments and final settlements. Larger payments remain limited by the outstanding balance."))
    "trash" -> listOf(SettingField("trash.autoDeleteDays", "Automatically delete Trash", "choice", listOf("0" to "Never", "3" to "After 3 days", "7" to "After 7 days", "30" to "After 30 days"), hint = "Starts when a client enters Trash and applies to existing Trash. Permanent deletion removes the client, receipts and renewal history. Deletion already started will finish even if automatic deletion is turned off."))
    "index" -> listOf(
        SettingField("index.businessName", "Lender name", maxLength = 120),
        SettingField("index.branch", "Branch / location", maxLength = 200),
        SettingField("index.mobile", "Mobile number", "phone", maxLength = 40),
        SettingField("index.amountBasis", "Printed amount", "choice", listOf("total" to "Principal + interest", "principal" to "Principal only"), hint = "Printed label only. Balances always include fixed interest."),
        SettingField("index.headingColor", "Heading accent", "color", hint = "Six-digit hex color, e.g. #f5efa5"),
        SettingField("index.cellColor", "Payment cell accent", "color", hint = "Six-digit hex color, e.g. #a1bfcd"),
    )
    "promissory" -> listOf(
        SettingField("promissory.payee", "Payee / person to pay", maxLength = 200),
        SettingField("promissory.executionPlace", "Place of execution", maxLength = 300),
        SettingField("promissory.interestStatement", "Interest and service charge statement", "multiline", hint = "Printed verbatim; this wording does not recalculate fixed interest."),
    )
    "studio" -> listOf("index" to "Index card", "promissory" to "Promissory note", "summary" to "Daily summary sheet").flatMap { (kind, title) ->
        val prefix = "studio." + kind + "."
        listOf(
            SettingField(prefix + "paper", title + " · paper", "choice", listOf("template" to "Template", "a4" to "A4", "letter" to "Letter", "legal" to "Legal", "custom" to "Custom")),
            SettingField(prefix + "orientation", title + " · orientation", "choice", listOf("portrait" to "Portrait", "landscape" to "Landscape")),
            SettingField(prefix + "widthMm", title + " · custom width (mm)", "decimal", hint = "70–600 mm"),
            SettingField(prefix + "heightMm", title + " · custom height (mm)", "decimal", hint = "70–600 mm"),
            SettingField(prefix + "marginMm", title + " · margin (mm)", "decimal", hint = "0–30 mm"),
            SettingField(prefix + "fontSize", title + " · font size (pt)", "decimal", hint = "6–18 pt in 0.5 pt steps"),
        )
    }
    else -> emptyList()
}

fun settingsValues(settings: AppSettings): Map<String, String> = buildMap {
    put("general.businessName", settings.general.businessName)
    put("general.clientIdPrefix", settings.general.clientIdPrefix)
    put("general.clientIdDigits", settings.general.clientIdDigits.toString())
    put("general.defaultPaymentNote", settings.general.defaultPaymentNote)
    put("general.recentPaymentsLimit", settings.general.recentPaymentsLimit.toString())
    put("general.dueClientsLimit", settings.general.dueClientsLimit.toString())
    put("payments.enforceDailyMinimum", settings.payments.enforceDailyMinimum.toString())
    put("trash.autoDeleteDays", settings.trash.autoDeleteDays.toString())
    put("index.businessName", settings.index.businessName)
    put("index.branch", settings.index.branch)
    put("index.mobile", settings.index.mobile)
    put("index.amountBasis", settings.index.amountBasis)
    put("index.headingColor", settings.index.headingColor)
    put("index.cellColor", settings.index.cellColor)
    put("promissory.payee", settings.promissory.payee)
    put("promissory.executionPlace", settings.promissory.executionPlace)
    put("promissory.interestStatement", settings.promissory.interestStatement)
    settings.studio.forEach { (kind, layout) ->
        val prefix = "studio." + kind + "."
        put(prefix + "paper", layout.paper); put(prefix + "orientation", layout.orientation)
        put(prefix + "widthMm", layout.widthMm.toString()); put(prefix + "heightMm", layout.heightMm.toString())
        put(prefix + "marginMm", layout.marginMm.toString()); put(prefix + "fontSize", layout.fontSize.toString())
    }
}

fun validateSettingsValues(values: Map<String, String>, baseline: AppSettings): SettingsDraftValidation {
    val errors = mutableMapOf<String, String>()
    fun text(key: String): String {
        val value = values[key].orEmpty()
        val limit = settingsSections.flatMap { settingFields(it.first) }.find { it.key == key }?.maxLength ?: 1500
        if (value.isBlank()) errors[key] = "This field is required."
        else if (value.length > limit) errors[key] = "Use at most " + limit + " characters."
        return value
    }
    fun integer(key: String, range: IntRange): Int {
        val value = values[key]?.toIntOrNull()
        if (value == null || value !in range) errors[key] = "Enter a whole number from " + range.first + " to " + range.last + "."
        return value ?: range.first
    }
    fun decimal(key: String, min: Double, max: Double): Double {
        val value = values[key]?.toDoubleOrNull()
        if (value == null || !value.isFinite() || value < min || value > max) errors[key] = "Enter a number from " + min + " to " + max + "."
        return value ?: min
    }
    val general = GeneralSettings(text("general.businessName"), text("general.clientIdPrefix"), integer("general.clientIdDigits", 1..10), text("general.defaultPaymentNote"), integer("general.recentPaymentsLimit", 1..100), integer("general.dueClientsLimit", 1..100))
    if (!Regex("^[a-zA-Z][a-zA-Z0-9_-]{0,19}$").matches(general.clientIdPrefix)) errors["general.clientIdPrefix"] = "Start with a letter; use up to 20 letters, numbers, underscores or hyphens."
    val enforce = values["payments.enforceDailyMinimum"]?.toBooleanStrictOrNull()
    if (enforce == null) errors["payments.enforceDailyMinimum"] = "Choose whether to enforce the minimum."
    val retention = values["trash.autoDeleteDays"]?.toIntOrNull()
    if (retention !in listOf(0, 3, 7, 30)) errors["trash.autoDeleteDays"] = "Choose Never, 3, 7 or 30 days."
    val index = IndexSettings(text("index.businessName"), text("index.branch"), text("index.mobile"), values["index.amountBasis"].orEmpty(), values["index.headingColor"].orEmpty(), values["index.cellColor"].orEmpty())
    if (index.amountBasis !in listOf("principal", "total")) errors["index.amountBasis"] = "Choose a printed amount."
    listOf("headingColor" to index.headingColor, "cellColor" to index.cellColor).forEach { (key, color) -> if (!Regex("^#[a-fA-F0-9]{6}$").matches(color)) errors["index." + key] = "Use a six-digit hex color." }
    val promissory = PromissorySettings(text("promissory.payee"), text("promissory.interestStatement"), text("promissory.executionPlace"))
    val layouts = listOf("index", "promissory", "summary").associateWith { kind ->
        val prefix = "studio." + kind + "."
        val paper = values[prefix + "paper"].orEmpty()
        val orientation = values[prefix + "orientation"].orEmpty()
        if (paper !in listOf("template", "a4", "letter", "legal", "custom")) errors[prefix + "paper"] = "Choose a paper size."
        if (orientation !in listOf("portrait", "landscape")) errors[prefix + "orientation"] = "Choose an orientation."
        val font = decimal(prefix + "fontSize", 6.0, 18.0)
        if (font * 2 != (font * 2).toInt().toDouble()) errors[prefix + "fontSize"] = "Use 0.5 pt steps."
        PrintLayout(paper, orientation, decimal(prefix + "widthMm", 70.0, 600.0), decimal(prefix + "heightMm", 70.0, 600.0), decimal(prefix + "marginMm", 0.0, 30.0), font)
    }
    return if (errors.isEmpty()) SettingsDraftValidation(baseline.copy(general = general, payments = PaymentSettings(enforce == true), trash = TrashSettings(retention ?: 0), index = index, promissory = promissory, studio = layouts)) else SettingsDraftValidation(errors = errors)
}
