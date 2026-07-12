package com.prayer.pointfinder.feature.operator

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFColors
import com.prayer.pointfinder.core.designsystem.PFDimensionToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal enum class OperatorTone { INFO, PENDING, SUCCESS, DANGER, OVERRIDE, MUTED }
internal data class OperatorMapLegendItem(val label: String, val tone: OperatorTone)

@Composable
internal fun OperatorStatusBadge(label: String, tone: OperatorTone, modifier: Modifier = Modifier) {
    val accent = tone.operatorColor(isSystemInDarkTheme())
    Surface(modifier = modifier, color = accent.copy(alpha = 0.14f), contentColor = accent, shape = androidx.compose.foundation.shape.CircleShape) {
        Text(label, modifier = Modifier.padding(horizontal = PFSpacingToken.Space2, vertical = PFSpacingToken.Space1), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun OperatorStatTile(value: String, label: String, tone: OperatorTone = OperatorTone.MUTED, modifier: Modifier = Modifier) {
    val dark = isSystemInDarkTheme()
    val accent = tone.operatorColor(dark)
    val panel = if (dark) PFColors.SurfaceOverlayDark else PFColors.SurfaceOverlayLight
    Surface(modifier = modifier, color = panel, shape = MaterialTheme.shapes.medium, shadowElevation = 2.dp, border = BorderStroke(1.dp, (if (dark) PFColors.BorderSubtleDark else PFColors.BorderSubtleLight))) {
        Column(modifier = Modifier.padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = accent)
            Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
internal fun OperatorSubmissionCard(
    teamName: String,
    challengeTitle: String,
    baseName: String,
    answer: String?,
    submittedAt: String,
    statusLabel: String,
    statusTone: OperatorTone,
    mediaCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space3), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(teamName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (mediaCount > 0) {
                    Icon(Icons.Default.PhotoLibrary, contentDescription = "Photo submissions", modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant) // TODO: Extract to string resources
                    if (mediaCount > 1) {
                        Spacer(Modifier.width(PFSpacingToken.Space1))
                        Text(mediaCount.toString(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.width(PFSpacingToken.Space2))
                }
                OperatorStatusBadge(statusLabel, statusTone)
            }
            Text(challengeTitle, style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(baseName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!answer.isNullOrBlank()) {
                Text(answer, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Text(submittedAt, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
        }
    }
}

@Composable
internal fun OperatorRescueActionButton(
    label: String,
    icon: ImageVector,
    tone: OperatorTone,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val accent = tone.operatorColor(isSystemInDarkTheme())
    Surface(
        modifier = modifier.heightIn(min = PFDimensionToken.TouchTarget).clickable(onClick = onClick),
        color = accent.copy(alpha = 0.13f),
        contentColor = accent,
        shape = androidx.compose.foundation.shape.CircleShape,
        border = BorderStroke(1.dp, accent.copy(alpha = 0.28f)),
    ) {
        Row(modifier = Modifier.padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2), horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
internal fun OperatorOverrideBadge(label: String, modifier: Modifier = Modifier) =
    OperatorStatusBadge(label, OperatorTone.OVERRIDE, modifier)

@Composable
internal fun OperatorMapLegend(items: List<OperatorMapLegendItem>, modifier: Modifier = Modifier) {
    val dark = isSystemInDarkTheme()
    val panel = if (dark) PFColors.SurfaceOverlayDark else PFColors.SurfaceOverlayLight
    Surface(modifier = modifier, color = panel, shape = MaterialTheme.shapes.medium, shadowElevation = 4.dp) {
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2),
            horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3),
        ) {
            items.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                    Surface(modifier = Modifier.size(8.dp), color = item.tone.operatorColor(dark), shape = androidx.compose.foundation.shape.CircleShape) {}
                    Text(item.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun OperatorTone.operatorColor(dark: Boolean): Color = when (this) {
    OperatorTone.INFO -> if (dark) PFColors.StatusCheckedInDark else PFColors.StatusCheckedInLight
    OperatorTone.PENDING -> if (dark) PFColors.StatusPendingDark else PFColors.StatusPendingLight
    OperatorTone.SUCCESS -> if (dark) PFColors.StatusCompletedDark else PFColors.StatusCompletedLight
    OperatorTone.DANGER -> if (dark) PFColors.StatusRejectedDark else PFColors.StatusRejectedLight
    OperatorTone.OVERRIDE -> if (dark) PFColors.StatusOperatorOverrideDark else PFColors.StatusOperatorOverrideLight
    OperatorTone.MUTED -> if (dark) PFColors.ContentSecondaryDark else PFColors.ContentSecondaryLight
}

@Composable
internal fun operatorToneColor(tone: OperatorTone): Color = tone.operatorColor(isSystemInDarkTheme())

@Preview(name = "Operator live components · light", showBackground = true, widthDp = 420)
@Preview(name = "Operator live components · dark", showBackground = true, widthDp = 420, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun OperatorLiveComponentsPreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            Row(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                OperatorStatTile("8", "Teams")
                OperatorStatTile("3", "Pending", OperatorTone.PENDING)
                OperatorStatTile("68%", "Progress", OperatorTone.SUCCESS)
            }
            OperatorSubmissionCard(
                teamName = "Team North Ridge",
                challengeTitle = "Emergency navigation with an intentionally long localized title",
                baseName = "Forest checkpoint",
                answer = "We followed the eastern bearing and documented the marker.",
                submittedAt = "21:42",
                statusLabel = "Pending",
                statusTone = OperatorTone.PENDING,
                mediaCount = 3,
                onClick = {},
            )
            Row(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                OperatorRescueActionButton("Mark completed", Icons.Default.CheckCircle, OperatorTone.OVERRIDE, {})
                OperatorRescueActionButton("Grant access", Icons.Default.LockOpen, OperatorTone.INFO, {})
            }
            OperatorOverrideBadge("Override · Alex · 21:40")
            OperatorMapLegend(
                listOf(
                    OperatorMapLegendItem("Not visited", OperatorTone.MUTED),
                    OperatorMapLegendItem("Checked in", OperatorTone.INFO),
                    OperatorMapLegendItem("Awaiting review", OperatorTone.PENDING),
                    OperatorMapLegendItem("Completed", OperatorTone.SUCCESS),
                    OperatorMapLegendItem("Rejected", OperatorTone.DANGER),
                ),
                Modifier.fillMaxWidth(),
            )
        }
    }
}
