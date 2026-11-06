package com.mcl.mcllendingapp.util

import java.math.RoundingMode
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val businessZone = ZoneId.of("Asia/Manila")
fun businessToday(): String = LocalDate.now(businessZone).toString()
fun money(value: Double): String = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-PH")).format(value)
fun displayDate(value: String): String = runCatching {
    LocalDate.parse(value).format(DateTimeFormatter.ofPattern("MMM d, uuuu", Locale.ENGLISH))
}.getOrDefault(value)
fun displayTime(value: Long?): String = value?.let {
    DateTimeFormatter.ofPattern("MMM d, uuuu h:mm a", Locale.ENGLISH).withZone(businessZone).format(Instant.ofEpochMilli(it))
} ?: "Awaiting server time"
fun parseMoney(text: String): Double {
    val value = text.trim().toBigDecimalOrNull() ?: error("Enter a valid amount.")
    require(value.scale() <= 2) { "Use at most two decimal places." }
    require(value.signum() >= 0 && value <= "999999999".toBigDecimal()) { "Amount is outside the supported range." }
    return value.setScale(2, RoundingMode.UNNECESSARY).toDouble()
}
