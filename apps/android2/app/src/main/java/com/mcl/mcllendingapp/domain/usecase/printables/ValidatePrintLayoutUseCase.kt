package com.mcl.mcllendingapp.domain.usecase.printables

import com.mcl.mcllendingapp.domain.model.PrintLayout
import javax.inject.Inject

/** Validates physical paper limits and half-point font increments before rendering. */
class ValidatePrintLayoutUseCase @Inject constructor() {
    operator fun invoke(layout: PrintLayout): Map<String, String> = buildMap {
        if (!layout.widthMm.isFinite() || layout.widthMm !in 70.0..600.0) put("WIDTH", "Enter a width from 70 to 600 mm.")
        if (!layout.heightMm.isFinite() || layout.heightMm !in 70.0..600.0) put("HEIGHT", "Enter a height from 70 to 600 mm.")
        if (!layout.marginMm.isFinite() || layout.marginMm !in 0.0..30.0) put("MARGIN", "Enter a margin from 0 to 30 mm.")
        if (!layout.fontSize.isFinite() || layout.fontSize !in 6.0..18.0 || layout.fontSize * 2 % 1 != 0.0)
            put("FONT_SIZE", "Enter a font size from 6 to 18 pt in steps of 0.5.")
    }
}
