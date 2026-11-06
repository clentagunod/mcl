package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class AppSettings(val general: GeneralSettings = GeneralSettings(),
    val payments: PaymentSettings = PaymentSettings(), val trash: TrashSettings = TrashSettings(),
    val index: IndexSettings = IndexSettings(), val promissory: PromissorySettings = PromissorySettings(),
    val studio: Map<String, PrintLayout> = mapOf(
        "index" to PrintLayout("template", "landscape", 238.0, 122.0, 2.0, 11.0),
        "promissory" to PrintLayout(),
        "summary" to PrintLayout("a4", "landscape", 297.0, 210.0, 10.0, 9.0)),
    val revision: String = "")
