package com.prayer.pointfinder.feature.operator

import android.content.res.Configuration
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import com.prayer.pointfinder.core.designsystem.PFDimensionToken
import com.prayer.pointfinder.core.designsystem.PFSpacingToken

internal data class ManagementMetadata(val label: String, val tone: OperatorTone)

@Composable
internal fun ManagementResourceRow(
    title: String,
    subtitle: String?,
    metadata: List<ManagementMetadata>,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
) {
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = PFDimensionToken.TouchTarget).clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Row(modifier = Modifier.padding(PFSpacingToken.Space3), verticalAlignment = Alignment.CenterVertically) {
            if (leadingIcon != null) {
                val accent = operatorToneColor(OperatorTone.INFO)
                Surface(color = accent.copy(alpha = 0.11f), contentColor = accent, shape = MaterialTheme.shapes.small) {
                    Icon(leadingIcon, contentDescription = title, modifier = Modifier.padding(PFSpacingToken.Space2).size(18.dp))
                }
                Spacer(Modifier.width(PFSpacingToken.Space3))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!subtitle.isNullOrBlank()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                    metadata.forEach { item -> OperatorStatusBadge(item.label, item.tone) }
                }
            }
            Spacer(Modifier.width(PFSpacingToken.Space2))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Navigate", tint = MaterialTheme.colorScheme.onSurfaceVariant) // TODO: Extract to string resources
        }
    }
}

@Composable
internal fun ManagementTeamRow(
    name: String,
    joinCode: String?,
    teamColor: Color,
    copyLabel: String,
    onCopy: (() -> Unit)?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    joinCodeModifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth().heightIn(min = PFDimensionToken.TouchTarget).clickable(onClick = onClick),
        color = MaterialTheme.colorScheme.surface,
        shape = MaterialTheme.shapes.large,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shadowElevation = 1.dp,
    ) {
        Row(modifier = Modifier.padding(PFSpacingToken.Space3), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(34.dp).background(teamColor, CircleShape))
            Spacer(Modifier.width(PFSpacingToken.Space3))
            Column(modifier = Modifier.weight(1f)) {
                Text(name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!joinCode.isNullOrBlank()) Text(joinCode, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = joinCodeModifier)
            }
            if (onCopy != null) IconButton(onClick = onCopy) { Icon(Icons.Default.ContentCopy, contentDescription = copyLabel, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Navigate", tint = MaterialTheme.colorScheme.onSurfaceVariant) // TODO: Extract to string resources
        }
    }
}

@Composable
internal fun ManagementListSummary(label: String, count: Int, attentionLabel: String? = null, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.fillMaxWidth(), color = operatorToneColor(OperatorTone.INFO).copy(alpha = 0.09f), shape = MaterialTheme.shapes.medium) {
        Row(modifier = Modifier.padding(horizontal = PFSpacingToken.Space3, vertical = PFSpacingToken.Space2), verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            OperatorStatusBadge(count.toString(), OperatorTone.INFO)
            if (!attentionLabel.isNullOrBlank()) {
                Spacer(Modifier.width(PFSpacingToken.Space2))
                OperatorStatusBadge(attentionLabel, OperatorTone.PENDING)
            }
        }
    }
}

@Composable
internal fun ManagementAssignmentRow(
    challengeTitle: String,
    teamLabel: String,
    pointsLabel: String?,
    teamColor: Color?,
    deleteLabel: String,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    deleteModifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Row(modifier = Modifier.padding(start = PFSpacingToken.Space3, top = PFSpacingToken.Space2, bottom = PFSpacingToken.Space2), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                Text(challengeTitle, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                    if (teamColor != null) Box(Modifier.size(9.dp).background(teamColor, CircleShape))
                    Text(teamLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!pointsLabel.isNullOrBlank()) OperatorStatusBadge(pointsLabel, OperatorTone.PENDING)
                }
            }
            IconButton(onClick = onDelete, modifier = deleteModifier) { Icon(Icons.Default.Delete, contentDescription = deleteLabel, tint = operatorToneColor(OperatorTone.DANGER)) }
        }
    }
}

@Composable
internal fun VariableCompletenessSummary(variableCount: Int, teamCount: Int, completedValues: Int, totalValues: Int, variablesLabel: String, teamsLabel: String, completeLabel: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
        OperatorStatTile(variableCount.toString(), variablesLabel, OperatorTone.INFO, Modifier.weight(1f))
        OperatorStatTile(teamCount.toString(), teamsLabel, OperatorTone.MUTED, Modifier.weight(1f))
        OperatorStatTile("$completedValues/$totalValues", completeLabel, if (totalValues > 0 && completedValues == totalValues) OperatorTone.SUCCESS else OperatorTone.PENDING, Modifier.weight(1f))
    }
}

@Composable
internal fun ManagementEditorSummary(
    title: String,
    metadata: List<ManagementMetadata>,
    validationLabel: String,
    isValid: Boolean,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space3), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                OperatorStatusBadge(validationLabel, if (isValid) OperatorTone.SUCCESS else OperatorTone.PENDING)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space1)) {
                metadata.forEach { item -> OperatorStatusBadge(item.label, item.tone) }
            }
        }
    }
}

@Composable
internal fun ManagementNotificationRow(message: String, targetLabel: String, timeLabel: String?, modifier: Modifier = Modifier) {
    Column(modifier = modifier.fillMaxWidth().padding(vertical = PFSpacingToken.Space1), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
        Text(message, style = MaterialTheme.typography.bodyMedium)
        Row(verticalAlignment = Alignment.CenterVertically) {
            OperatorStatusBadge(targetLabel, OperatorTone.INFO)
            Spacer(Modifier.weight(1f))
            if (!timeLabel.isNullOrBlank()) Text(timeLabel, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun OrganizationWorkspaceSummary(name: String, slug: String, tier: String, memberCount: Int, liveGameCount: Int, membersLabel: String, liveGamesLabel: String, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space3), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("@$slug", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OperatorStatusBadge(tier.uppercase(), OperatorTone.OVERRIDE)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
                OperatorStatTile(memberCount.toString(), membersLabel, OperatorTone.INFO, Modifier.weight(1f))
                OperatorStatTile(liveGameCount.toString(), liveGamesLabel, if (liveGameCount > 0) OperatorTone.SUCCESS else OperatorTone.MUTED, Modifier.weight(1f))
            }
        }
    }
}

@Composable
internal fun ManagementEmptyState(title: String, description: String? = null, modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space2)) {
        Icon(Icons.Default.Inventory2, contentDescription = title, modifier = Modifier.size(40.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (!description.isNullOrBlank()) Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Preview(name = "Resource management · light", showBackground = true, widthDp = 420)
@Preview(name = "Resource management · dark", showBackground = true, widthDp = 420, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun ResourceManagementPreview() {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(modifier = Modifier.padding(PFSpacingToken.Space4), verticalArrangement = Arrangement.spacedBy(PFSpacingToken.Space3)) {
            ManagementListSummary("Field resources", 8, "1 needs NFC")
            ManagementResourceRow("Northern forest checkpoint", "Navigation challenge with a long localized description", listOf(ManagementMetadata("NFC linked", OperatorTone.SUCCESS), ManagementMetadata("Text", OperatorTone.INFO)), {}, leadingIcon = Icons.Default.Inventory2)
            ManagementTeamRow("International patrol north ridge", "PF-42K9", operatorToneColor(OperatorTone.INFO), "Copy join code", {}, {})
            ManagementAssignmentRow("Emergency navigation", "All teams", "25 pts", null, "Delete", {})
            ManagementEditorSummary("Edit checkpoint", listOf(ManagementMetadata("NFC linked", OperatorTone.SUCCESS), ManagementMetadata("3 challenges", OperatorTone.INFO)), "Ready", true)
            ManagementNotificationRow("Return to the northern checkpoint before dusk.", "All teams", "2 min ago")
            ManagementEmptyState("No resources match these filters")
        }
    }
}
