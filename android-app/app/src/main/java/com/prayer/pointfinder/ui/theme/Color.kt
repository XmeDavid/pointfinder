package com.prayer.pointfinder.ui.theme

import androidx.compose.ui.graphics.Color
import com.prayer.pointfinder.core.designsystem.PFColors

// Brand / primary
val GreenSeed = Color(0xFF22C55E)
val GreenDark = Color(0xFF16A34A)
val GreenLight = Color(0xFF86EFAC)

// Status colors (used for base progress, badges, indicators)
val StatusCheckedIn = Color(0xFF3B82F6)
val StatusCompleted = Color(0xFF22C55E)
val StatusSubmitted = Color(0xFFF59E0B)
val StatusRejected = Color(0xFFEF4444)

// Semantic parity tokens (matching iOS PfCompleted / PfCheckedIn / etc.)
val PfCompleted = PFColors.StatusCompletedLight
val PfCheckedIn = PFColors.StatusCheckedInLight
val PfPending = PFColors.StatusPendingLight
val PfRejected = PFColors.StatusRejectedLight

// Waypoint surface colors (light theme)
val WaypointBackground = Color(0xFFFAFAF8)
val WaypointCard = Color(0xFFFFFFFF)
val WaypointMapBg = Color(0xFFE4E2D0)
val WaypointTextMuted = Color(0xFF999999)
val WaypointInactive = Color(0xFFE0DDD0)

// Trail surface colors (dark theme)
val TrailBackground = Color(0xFF0A1A0D)
val TrailCard = Color(0xFF14261A)
val TrailCardBorder = Color(0xFF1E3A26)
val TrailMapBg = Color(0xFF0D1A0F)
val TrailTextMuted = Color(0xFF5A8A5A)
val TrailInactive = Color(0xFF1A3A1A)

// Accent / decorative
val StarGold = Color(0xFFF59E0B)
val BadgePurple = Color(0xFF7B1FA2)
val BadgeIndigo = Color(0xFF303F9F)

// Semantic
val ErrorRed = Color(0xFFB00020)
val OfflineOrange = Color(0xFFE08A00)

// ── Light theme palette ──────────────────────────────────────────────
val LightPrimary = PFColors.ActionPrimaryLight
val LightOnPrimary = PFColors.ActionOnPrimaryLight
val LightPrimaryContainer = Color(0xFFD4EDDA)
val LightOnPrimaryContainer = Color(0xFF0A5C2B)
val LightSecondary = Color(0xFF4B6B5A)
val LightOnSecondary = Color(0xFFFFFFFF)
val LightSecondaryContainer = Color(0xFFCDE5D7)
val LightOnSecondaryContainer = Color(0xFF08201A)
val LightTertiary = Color(0xFF7C6520)
val LightOnTertiary = Color(0xFFFFFFFF)
val LightTertiaryContainer = Color(0xFFFFE08D)
val LightOnTertiaryContainer = Color(0xFF261A00)
val LightBackground = PFColors.SurfaceCanvasLight
val LightOnBackground = PFColors.ContentPrimaryLight
val LightSurface = PFColors.SurfacePanelLight
val LightOnSurface = PFColors.ContentPrimaryLight
val LightSurfaceVariant = Color(0xFFE0E8E2)
val LightOnSurfaceVariant = Color(0xFF44483E)
val LightOutline = Color(0xFF74796D)
val LightOutlineVariant = Color(0xFFC4C8BB)
val LightError = ErrorRed
val LightOnError = Color(0xFFFFFFFF)
val LightErrorContainer = Color(0xFFFCDAD7)
val LightOnErrorContainer = Color(0xFF410002)
val LightInverseSurface = Color(0xFF303030)
val LightInverseOnSurface = Color(0xFFF1F1F1)
val LightInversePrimary = Color(0xFF7DDC93)
val LightSurfaceTint = GreenSeed
val LightScrim = Color(0xFF000000)

// ── Dark theme palette ───────────────────────────────────────────────
val DarkPrimary = PFColors.ActionPrimaryDark
val DarkOnPrimary = Color(0xFF003919)
val DarkPrimaryContainer = Color(0xFF005227)
val DarkOnPrimaryContainer = Color(0xFFA8F0B6)
val DarkSecondary = Color(0xFFB2CFC0)
val DarkOnSecondary = Color(0xFF1F352A)
val DarkSecondaryContainer = Color(0xFF354B40)
val DarkOnSecondaryContainer = Color(0xFFCDE5D7)
val DarkTertiary = Color(0xFFE2C36E)
val DarkOnTertiary = Color(0xFF3F2E00)
val DarkTertiaryContainer = Color(0xFF5A4400)
val DarkOnTertiaryContainer = Color(0xFFFFE08D)
val DarkBackground = PFColors.SurfaceCanvasDark
val DarkOnBackground = PFColors.ContentPrimaryDark
val DarkSurface = PFColors.SurfacePanelDark
val DarkOnSurface = PFColors.ContentPrimaryDark
val DarkSurfaceVariant = Color(0xFF44483E)
val DarkOnSurfaceVariant = Color(0xFFC4C8BB)
val DarkOutline = Color(0xFF8E9285)
val DarkOutlineVariant = Color(0xFF44483E)
val DarkError = Color(0xFFFFB4AB)
val DarkOnError = Color(0xFF690005)
val DarkErrorContainer = Color(0xFF93000A)
val DarkOnErrorContainer = Color(0xFFFCDAD7)
val DarkInverseSurface = Color(0xFFE2E3DD)
val DarkInverseOnSurface = Color(0xFF303030)
val DarkInversePrimary = GreenSeed
val DarkSurfaceTint = GreenLight
val DarkScrim = Color(0xFF000000)
