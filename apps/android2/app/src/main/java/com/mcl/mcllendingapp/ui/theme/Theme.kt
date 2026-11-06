package com.mcl.mcllendingapp.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = BrandColors.Primary,
    onPrimary = BrandColors.Surface,
    primaryContainer = BrandColors.Alternate,
    onPrimaryContainer = BrandColors.Primary,
    background = BrandColors.Background,
    onBackground = BrandColors.Text,
    surface = BrandColors.Surface,
    onSurface = BrandColors.Text,
    surfaceVariant = BrandColors.Alternate,
    onSurfaceVariant = BrandColors.Muted,
    outline = BrandColors.Border,
    error = BrandColors.Due
)
private val DarkColorScheme = darkColorScheme(
    primary = BrandColors.PrimaryDark,
    onPrimary = BrandColors.BackgroundDark,
    primaryContainer = BrandColors.AlternateDark,
    onPrimaryContainer = BrandColors.PrimaryDark,
    background = BrandColors.BackgroundDark,
    onBackground = BrandColors.TextDark,
    surface = BrandColors.SurfaceDark,
    onSurface = BrandColors.TextDark,
    surfaceVariant = BrandColors.AlternateDark,
    onSurfaceVariant = BrandColors.MutedDark,
    outline = BrandColors.BorderDark,
    error = BrandColors.DueDark
)

@Composable
fun MCLLendingAppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val activity=LocalActivity.current as? ComponentActivity
    SideEffect {
        activity?.enableEdgeToEdge(
            statusBarStyle=SystemBarStyle.auto(android.graphics.Color.TRANSPARENT,android.graphics.Color.TRANSPARENT){darkTheme},
            navigationBarStyle=SystemBarStyle.auto(android.graphics.Color.TRANSPARENT,android.graphics.Color.TRANSPARENT){darkTheme}
        )
        if(Build.VERSION.SDK_INT>=29) activity?.window?.isNavigationBarContrastEnforced=false
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        shapes = Shapes(
            extraSmall = RoundedCornerShape(AppSpacing.extraSmall),
            small = RoundedCornerShape(AppSpacing.small),
            medium = RoundedCornerShape(AppSpacing.small + AppSpacing.extraSmall / 2),
            large = RoundedCornerShape(AppSpacing.medium),
            extraLarge = RoundedCornerShape(AppSpacing.large)
        ),
        content = content
    )
}
