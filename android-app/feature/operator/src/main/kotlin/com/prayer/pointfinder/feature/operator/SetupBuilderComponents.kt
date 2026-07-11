package com.prayer.pointfinder.feature.operator

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFColors
import com.prayer.pointfinder.core.designsystem.PFDimensionToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal data class SetupReadinessItem(
    val label: String,
    val detail: String,
    val ready: Boolean,
)

@Composable
internal fun SetupReadinessPanel(
    title: String,
    readyLabel: String,
    items: List<SetupReadinessItem>,
    modifier: Modifier = Modifier,
) {
    val readyCount = items.count { it.ready }
    val allReady = readyCount == items.size
    val accent = operatorToneColor(if (allReady) OperatorTone.SUCCESS else OperatorTone.PENDING)
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(readyLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OperatorStatusBadge("$readyCount/${items.size}", if (allReady) OperatorTone.SUCCESS else OperatorTone.PENDING)
            }
            items.forEach { item ->
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                    Icon(
                        imageVector = if (item.ready) Icons.Default.CheckCircle else Icons.Default.Warning,
                        contentDescription = null,
                        tint = if (item.ready) operatorToneColor(OperatorTone.SUCCESS) else accent,
                        modifier = Modifier.size(20.dp),
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text(item.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
internal fun SetupSpatialSummary(
    title: String,
    description: String,
    basesLabel: String,
    nfcLabel: String,
    assignmentsLabel: String,
    openMapLabel: String,
    onOpenMap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val tint = if (dark) PFColors.StatusCheckedInDark else PFColors.StatusCheckedInLight
    Surface(
        modifier = modifier.fillMaxWidth().clickable(onClick = onOpenMap),
        color = tint.copy(alpha = 0.10f),
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, tint.copy(alpha = 0.30f)),
    ) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = tint)
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                OperatorStatusBadge(basesLabel, OperatorTone.INFO)
                OperatorStatusBadge(nfcLabel, OperatorTone.SUCCESS)
                OperatorStatusBadge(assignmentsLabel, OperatorTone.MUTED)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(openMapLabel, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = tint, modifier = Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = tint)
            }
        }
    }
}

@Composable
internal fun SetupResourceRow(
    icon: ImageVector,
    label: String,
    value: String,
    tone: OperatorTone,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = operatorToneColor(tone)
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = PFDimensionToken.TouchTarget).clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.medium,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(modifier = Modifier.padding(PFSpacingToken.Space3), verticalAlignment = Alignment.CenterVertically) {
            Surface(color = tint.copy(alpha = 0.12f), contentColor = tint, shape = MaterialTheme.shapes.small) {
                Icon(icon, contentDescription = null, modifier = Modifier.padding(PFSpacingToken.Space2).size(18.dp))
            }
            Spacer(Modifier.width(PFSpacingToken.Space3))
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            OperatorStatusBadge(value, tone)
            Spacer(Modifier.width(PFSpacingToken.Space1))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun SetupLaunchButton(label: String, enabled: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val success = operatorToneColor(OperatorTone.SUCCESS)
    Button(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(containerColor = success),
        modifier = modifier.fillMaxWidth().heightIn(min = 52.dp).testTag("game-activate-btn"),
    ) {
        Icon(Icons.Default.PlayArrow, contentDescription = null)
        Spacer(Modifier.width(PFSpacingToken.Space2))
        Text(label, fontWeight = FontWeight.Bold)
    }
}

@Preview(name = "Setup builder · light", showBackground = true, widthDp = 420)
@Preview(name = "Setup builder · dark", showBackground = true, widthDp = 420, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun SetupBuilderComponentsPreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            SetupSpatialSummary("Spatial plan", "Place and inspect field stations on the map.", "8 bases", "7 NFC", "12 links", "Open map", {})
            SetupReadinessPanel(
                "Launch readiness",
                "Four of five checks are ready",
                listOf(
                    SetupReadinessItem("Bases", "Eight bases placed", true),
                    SetupReadinessItem("NFC", "One base still needs a tag", false),
                    SetupReadinessItem("Teams", "Six teams configured", true),
                ),
            )
            SetupResourceRow(Icons.Default.LocationOn, "Bases", "8", OperatorTone.INFO, {})
            SetupLaunchButton("Go live", false, {})
        }
    }
}
