package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LiveBaseProgressBottomSheet(
    base: Base,
    progress: List<TeamBaseProgressResponse>,
    teams: List<Team>,
    onWriteNfc: () -> Unit,
    writeStatus: String?,
    writeSuccess: Boolean?,
    onDismiss: () -> Unit,
) {
    val grouped = progress.filter { it.baseId == base.id }
    val completedCount = grouped.count { it.status == BaseStatus.COMPLETED }
    val checkedInCount = grouped.count { it.status == BaseStatus.CHECKED_IN }
    val pendingCount = grouped.count { it.status == BaseStatus.SUBMITTED }
    val remainingCount = grouped.size - completedCount - checkedInCount - pendingCount

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(base.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (base.description.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(base.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(12.dp))

            Button(
                onClick = onWriteNfc,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Nfc, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_write_nfc))
            }
            if (!writeStatus.isNullOrBlank()) {
                val statusColor = when (writeSuccess) {
                    true -> StatusCompleted
                    false -> MaterialTheme.colorScheme.error
                    null -> MaterialTheme.colorScheme.onSurfaceVariant
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    text = writeStatus,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor,
                )
            }
            Spacer(Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                StatBadge(count = completedCount, label = stringResource(R.string.status_completed), color = StatusCompleted, modifier = Modifier.weight(1f))
                StatBadge(count = pendingCount, label = stringResource(R.string.status_submitted), color = StatusSubmitted, modifier = Modifier.weight(1f))
                StatBadge(count = checkedInCount, label = stringResource(R.string.status_checked_in), color = StatusCheckedIn, modifier = Modifier.weight(1f))
                StatBadge(count = remainingCount, label = stringResource(R.string.label_remaining), color = Color.Gray, modifier = Modifier.weight(1f))
            }
            Spacer(Modifier.height(16.dp))

            grouped.forEach { item ->
                val team = teams.firstOrNull { it.id == item.teamId }
                val teamColor = team?.color?.let { c -> runCatching { Color(android.graphics.Color.parseColor(c)) }.getOrDefault(Color.Gray) } ?: Color.Gray
                val teamName = team?.name ?: item.teamId.take(8)
                val statusColor = when (item.status) {
                    BaseStatus.COMPLETED -> StatusCompleted
                    BaseStatus.CHECKED_IN -> StatusCheckedIn
                    BaseStatus.SUBMITTED -> StatusSubmitted
                    else -> Color.Gray
                }
                val statusLabel = when (item.status) {
                    BaseStatus.COMPLETED -> stringResource(R.string.status_completed)
                    BaseStatus.CHECKED_IN -> stringResource(R.string.status_checked_in)
                    BaseStatus.SUBMITTED -> stringResource(R.string.status_submitted)
                    BaseStatus.REJECTED -> stringResource(R.string.status_rejected)
                    else -> stringResource(R.string.status_not_visited)
                }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(teamColor))
                        Text(teamName, style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(
                        text = statusLabel,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = statusColor,
                        modifier = Modifier
                            .background(statusColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun StatBadge(count: Int, label: String, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .background(color.copy(alpha = 0.1f), shape = MaterialTheme.shapes.small)
            .padding(vertical = 8.dp, horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(count.toString(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = color, maxLines = 1)
    }
}

@Composable
fun OperatorBasesScreen(
    bases: List<Base>,
    onSelectBase: (Base) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(bases, key = { it.id }) { base ->
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectBase(base) },
                tonalElevation = 1.dp,
                shape = MaterialTheme.shapes.medium,
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(base.name, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text("${base.lat}, ${base.lng}", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(4.dp))
                    val nfcColor = if (base.nfcLinked) StatusCompleted else StatusSubmitted
                    val nfcLabel = if (base.nfcLinked) stringResource(R.string.label_nfc_linked) else stringResource(R.string.label_nfc_not_linked)
                    CapsuleBadge(label = nfcLabel, color = nfcColor)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OperatorBaseDetailScreen(
    base: Base,
    challenges: List<Challenge>,
    assignments: List<Assignment>,
    teams: List<Team>,
    writeStatus: String?,
    writeSuccess: Boolean?,
    onBack: () -> Unit,
    onWriteNfc: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val baseAssignments = assignments.filter { it.baseId == base.id }
    val fixedChallenge = base.fixedChallengeId?.let { fid -> challenges.firstOrNull { it.id == fid } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(base.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(base.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val nfcColor = if (base.nfcLinked) StatusCompleted else StatusSubmitted
                    val nfcLabel = if (base.nfcLinked) stringResource(R.string.label_nfc_linked) else stringResource(R.string.label_nfc_not_linked)
                    CapsuleBadge(label = nfcLabel, color = nfcColor)
                }
            }

            item {
                SectionCard {
                    Text(stringResource(R.string.action_write_nfc), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = onWriteNfc,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Nfc, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.action_write_nfc))
                    }
                    if (!writeStatus.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            writeStatus,
                            color = if (writeSuccess == true) StatusCompleted else MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }

            item {
                SectionCard {
                    Text(stringResource(R.string.label_challenge_assignment), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(8.dp))
                    if (fixedChallenge != null) {
                        CapsuleBadge(label = stringResource(R.string.label_fixed_challenge), color = BadgePurple)
                        Spacer(Modifier.height(8.dp))
                        ChallengeCard(challenge = fixedChallenge)
                    } else if (baseAssignments.isEmpty()) {
                        Text(stringResource(R.string.label_random_not_started), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        CapsuleBadge(label = stringResource(R.string.label_randomly_assigned), color = BadgeIndigo)
                        Spacer(Modifier.height(8.dp))
                        baseAssignments.forEach { assignment ->
                            val team = teams.firstOrNull { it.id == assignment.teamId }
                            val challenge = challenges.firstOrNull { it.id == assignment.challengeId }
                            if (team != null && challenge != null) {
                                TeamAssignmentRow(team = team, challenge = challenge)
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(16.dp)) }
        }
    }
}

@Composable
internal fun CapsuleBadge(label: String, color: Color) {
    Text(
        text = label,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Medium,
        color = color,
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), shape = MaterialTheme.shapes.small)
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun SectionCard(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f), shape = MaterialTheme.shapes.medium)
            .padding(14.dp),
        content = content,
    )
}

@Composable
private fun ChallengeCard(challenge: Challenge) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium)
            .padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(challenge.title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(14.dp))
                Text(stringResource(R.string.label_pts, challenge.points), style = MaterialTheme.typography.labelSmall, color = StarGold)
            }
        }
        Spacer(Modifier.height(4.dp))
        Text(challenge.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3)
        Spacer(Modifier.height(4.dp))
        Text(stringResource(R.string.label_answer_type, challenge.answerType), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
private fun TeamAssignmentRow(team: Team, challenge: Challenge) {
    val teamColor = runCatching { Color(android.graphics.Color.parseColor(team.color)) }.getOrDefault(Color.Gray)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.small)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(modifier = Modifier.size(12.dp).clip(CircleShape).background(teamColor))
        Column(modifier = Modifier.weight(1f)) {
            Text(team.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(challenge.title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(12.dp))
            Text("${challenge.points}", style = MaterialTheme.typography.labelSmall, color = StarGold)
        }
    }
}
