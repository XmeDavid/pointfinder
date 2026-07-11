package com.prayer.pointfinder.feature.player

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFColors
import com.prayer.pointfinder.core.designsystem.PFRadiusToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal enum class PlayerFieldTone { INFO, PENDING, SUCCESS, DANGER, UNKNOWN }

@Composable
internal fun PlayerFieldStatusBanner(
    title: String,
    message: String? = null,
    icon: ImageVector,
    iconContentDescription: String? = null,
    tone: PlayerFieldTone,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val accent = tone.color(dark)
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = accent.copy(alpha = if (dark) 0.16f else 0.08f),
        contentColor = MaterialTheme.colorScheme.onSurface,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.35f)),
    ) {
        Row(
            modifier = Modifier.padding(PFSpacingToken.Space3),
            horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(icon, contentDescription = iconContentDescription, tint = accent, modifier = Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = accent)
                if (!message.isNullOrBlank()) {
                    Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@Composable
internal fun PlayerNfcScanPrompt(
    state: ScanAnimationState,
    title: String,
    instructions: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AnimatedScanView(state = state, modifier = Modifier.size(260.dp))
        Spacer(Modifier.height(PFSpacingToken.Space5))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(PFSpacingToken.Space2))
        Text(
            instructions,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
internal fun PlayerSubmissionState(
    title: String,
    message: String,
    icon: ImageVector,
    tone: PlayerFieldTone,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val accent = tone.color(dark)
    Column(modifier = modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(color = accent.copy(alpha = 0.13f), shape = androidx.compose.foundation.shape.CircleShape) {
            Icon(icon, contentDescription = null, modifier = Modifier.padding(PFSpacingToken.Space6).size(52.dp), tint = accent)
        }
        Spacer(Modifier.height(PFSpacingToken.Space4))
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(PFSpacingToken.Space2))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@Composable
private fun PlayerFieldTone.color(dark: Boolean): Color = when (this) {
    PlayerFieldTone.INFO -> if (dark) PFColors.StatusCheckedInDark else PFColors.StatusCheckedInLight
    PlayerFieldTone.PENDING -> if (dark) PFColors.StatusPendingDark else PFColors.StatusPendingLight
    PlayerFieldTone.SUCCESS -> if (dark) PFColors.StatusCompletedDark else PFColors.StatusCompletedLight
    PlayerFieldTone.DANGER -> if (dark) PFColors.StatusRejectedDark else PFColors.StatusRejectedLight
    PlayerFieldTone.UNKNOWN -> if (dark) PFColors.StatusUnknownDark else PFColors.StatusUnknownLight
}

@Preview(name = "Player field states · light", showBackground = true, widthDp = 390)
@Preview(name = "Player field states · dark", showBackground = true, widthDp = 390, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun PlayerFieldStatesPreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            PlayerFieldStatusBanner(
                title = "Saved on this device",
                message = "It will sync when a connection returns.",
                icon = Icons.Default.CloudDone,
                tone = PlayerFieldTone.PENDING,
            )
            PlayerFieldStatusBanner(
                title = "Unable to sync",
                message = "Open the sync queue to retry.",
                icon = Icons.Default.Warning,
                tone = PlayerFieldTone.DANGER,
            )
            PlayerSubmissionState("Answer submitted", "Your answer is waiting for review.", Icons.Default.Schedule, PlayerFieldTone.PENDING)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PFColors.StatusCompletedLight)
                Spacer(Modifier.width(PFSpacingToken.Space2))
                Text("Canonical player live-loop states")
            }
        }
    }
}
