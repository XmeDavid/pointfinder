package com.prayer.pointfinder.feature.operator

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.designsystem.PFDimensionToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal data class GameLibraryMetric(val value: String, val label: String, val tone: OperatorTone)
internal data class GameLibraryWorkspace(val id: String?, val label: String, val detail: String?)

@Composable
internal fun GameLibrarySummary(metrics: List<GameLibraryMetric>, modifier: Modifier = Modifier) {
    LazyRow(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
        items(metrics) { metric -> OperatorStatTile(metric.value, metric.label, metric.tone) }
    }
}

@Composable
internal fun GameLibraryCard(
    name: String,
    description: String,
    statusLabel: String,
    statusTone: OperatorTone,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = PFDimensionToken.TouchTarget).clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
            Row(verticalAlignment = Alignment.Top) {
                Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                OperatorStatusBadge(statusLabel, statusTone)
            }
            if (description.isNotBlank()) {
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
internal fun GameLibraryWorkspaceChip(
    label: String,
    detail: String?,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tone = if (selected) OperatorTone.INFO else OperatorTone.MUTED
    val accent = operatorToneColor(tone)
    Surface(
        onClick = onClick,
        modifier = modifier.heightIn(min = PFDimensionToken.TouchTarget),
        color = accent.copy(alpha = if (selected) 0.14f else 0.08f),
        contentColor = accent,
        shape = androidx.compose.foundation.shape.CircleShape,
        border = BorderStroke(1.dp, accent.copy(alpha = if (selected) 0.42f else 0.20f)),
    ) {
        Column(modifier = Modifier.padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1)
            if (!detail.isNullOrBlank()) Text(detail, style = MaterialTheme.typography.labelSmall, color = accent.copy(alpha = 0.78f), maxLines = 1)
        }
    }
}

@Preview(name = "Game library · light", showBackground = true, widthDp = 420)
@Preview(name = "Game library · dark", showBackground = true, widthDp = 420, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun GameLibraryComponentsPreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            GameLibrarySummary(listOf(GameLibraryMetric("3", "Setup", OperatorTone.INFO), GameLibraryMetric("1", "Live", OperatorTone.SUCCESS), GameLibraryMetric("8", "Ended", OperatorTone.MUTED)))
            Row(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                GameLibraryWorkspaceChip("Personal", "4 games", true, {})
                GameLibraryWorkspaceChip("Regional operations", "12 members", false, {})
            }
            GameLibraryCard("Northern ridge field exercise", "An intentionally long localized description for the active exercise.", "Live", OperatorTone.SUCCESS, {})
        }
    }
}
