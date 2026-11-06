package com.mcl.mcllendingapp.domain.model

@kotlinx.serialization.Serializable
data class PromissorySettings(val payee: String = "CRISTOPHER A. LASARTE",
    val interestStatement: String = "PHP 150.00 per thousand and PHP 20.00 service charge per thousand",
    val executionPlace: String = "Compostela, Davao de Oro, and Philippines")
