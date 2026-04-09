package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateAssignmentRequest
import com.prayer.pointfinder.core.model.Team

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignmentsScreen(
    assignments: List<Assignment>,
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    onCreateAssignment: (CreateAssignmentRequest) -> Unit,
    onDeleteAssignment: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    var showCreateDialog by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<Assignment?>(null) }

    val assignableBases = bases.filter { it.fixedChallengeId == null }
    val challengeById = remember(challenges) { challenges.associateBy { it.id } }
    val teamById = remember(teams) { teams.associateBy { it.id } }
    val fixedChallengeIds = remember(bases) { bases.mapNotNull { it.fixedChallengeId }.toSet() }
    val assignableChallenges = remember(challenges, fixedChallengeIds) {
        challenges.filter { it.id !in fixedChallengeIds }
    }

    // Group assignments by baseId, preserving base order
    val assignmentsByBase = remember(assignments, assignableBases) {
        assignableBases.map { base ->
            base to assignments.filter { it.baseId == base.id }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.label_assignments)) },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("assignments-back-btn")) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                    }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showCreateDialog = true },
                modifier = Modifier.testTag("create-assignment-btn"),
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_new_assignment))
            }
        },
        modifier = modifier,
    ) { padding ->
        if (assignments.isEmpty() && assignableBases.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        stringResource(R.string.label_no_assignments),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        stringResource(R.string.label_no_assignments_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                // Summary chip
                item {
                    Text(
                        text = stringResource(R.string.label_assignment_count, assignments.size),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }

                // Grouped by base
                assignmentsByBase.forEach { (base, baseAssignments) ->
                    if (baseAssignments.isNotEmpty()) {
                        item(key = "header-${base.id}") {
                            Text(
                                text = base.name,
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 8.dp),
                            )
                        }
                        items(baseAssignments, key = { it.id }) { assignment ->
                            AssignmentItem(
                                assignment = assignment,
                                challenge = challengeById[assignment.challengeId],
                                team = assignment.teamId?.let { teamById[it] },
                                onDelete = { deleteTarget = assignment },
                            )
                            HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                        }
                    }
                }

                // Bases without assignments
                val unassignedBases = assignmentsByBase.filter { (_, a) -> a.isEmpty() }
                if (unassignedBases.isNotEmpty()) {
                    item {
                        Text(
                            text = stringResource(R.string.label_bases_without_assignments),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                    items(unassignedBases, key = { "unassigned-${it.first.id}" }) { (base, _) ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = base.name,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                    }
                }

                item { Spacer(Modifier.height(80.dp)) }
            }
        }
    }

    // Create dialog
    if (showCreateDialog) {
        AssignmentCreateDialog(
            bases = assignableBases,
            challenges = assignableChallenges,
            teams = teams,
            existingAssignments = assignments,
            onConfirm = { request ->
                onCreateAssignment(request)
                showCreateDialog = false
            },
            onDismiss = { showCreateDialog = false },
        )
    }

    // Delete confirmation
    deleteTarget?.let { assignment ->
        val challenge = challengeById[assignment.challengeId]
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text(stringResource(R.string.label_delete_assignment_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.label_delete_assignment_message,
                        challenge?.title ?: assignment.challengeId,
                    )
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onDeleteAssignment(assignment.id)
                        deleteTarget = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.testTag("assignment-delete-confirm-btn"),
                ) {
                    Text(stringResource(R.string.action_delete))
                }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

// ── Assignment Row ──────────────────────────────────────────────────────────

@Composable
private fun AssignmentItem(
    assignment: Assignment,
    challenge: Challenge?,
    team: Team?,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .testTag("assignment-row"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = challenge?.title ?: "?",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (team != null) {
                    val teamColor = parseTeamColor(team.color)
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(teamColor),
                    )
                    Text(
                        text = team.name,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    Text(
                        text = stringResource(R.string.label_all_teams),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (challenge != null) {
                    Text(
                        text = "· ${challenge.points} pts",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        IconButton(
            onClick = onDelete,
            modifier = Modifier.testTag("delete-assignment-btn"),
        ) {
            Icon(
                Icons.Default.Delete,
                contentDescription = stringResource(R.string.cd_delete),
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

// ── Create Dialog ───────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AssignmentCreateDialog(
    bases: List<Base>,
    challenges: List<Challenge>,
    teams: List<Team>,
    existingAssignments: List<Assignment>,
    onConfirm: (CreateAssignmentRequest) -> Unit,
    onDismiss: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var selectedBase by remember { mutableStateOf<Base?>(null) }
    var selectedChallenge by remember { mutableStateOf<Challenge?>(null) }
    var selectedTeam by remember { mutableStateOf<Team?>(null) }  // null = all teams

    var baseExpanded by remember { mutableStateOf(false) }
    var challengeExpanded by remember { mutableStateOf(false) }
    var teamExpanded by remember { mutableStateOf(false) }

    val assignedTeamIdsForBase = remember(selectedBase, existingAssignments) {
        val baseId = selectedBase?.id ?: return@remember emptySet<String>()
        existingAssignments.filter { it.baseId == baseId }.mapNotNull { it.teamId }.toSet()
    }

    val hasAllTeamsAssignment = remember(selectedBase, existingAssignments) {
        val baseId = selectedBase?.id ?: return@remember false
        existingAssignments.any { it.baseId == baseId && it.teamId == null }
    }

    val showAllTeamsOption = remember(selectedBase, existingAssignments) {
        val baseId = selectedBase?.id ?: return@remember true
        existingAssignments.none { it.baseId == baseId }
    }

    val availableTeams = remember(teams, assignedTeamIdsForBase) {
        teams.filter { it.id !in assignedTeamIdsForBase }
    }

    val canConfirm = selectedBase != null && selectedChallenge != null && !hasAllTeamsAssignment

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_new_assignment)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Base picker
                ExposedDropdownMenuBox(
                    expanded = baseExpanded,
                    onExpandedChange = { baseExpanded = it },
                ) {
                    OutlinedTextField(
                        value = selectedBase?.name ?: stringResource(R.string.label_select_base),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.label_bases)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = baseExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                            .testTag("assignment-base-picker"),
                    )
                    ExposedDropdownMenu(
                        expanded = baseExpanded,
                        onDismissRequest = { baseExpanded = false },
                    ) {
                        bases.forEach { base ->
                            DropdownMenuItem(
                                text = { Text(base.name) },
                                onClick = {
                                    selectedBase = base
                                    selectedTeam = null
                                    baseExpanded = false
                                },
                            )
                        }
                    }
                }

                // Challenge picker
                ExposedDropdownMenuBox(
                    expanded = challengeExpanded,
                    onExpandedChange = { challengeExpanded = it },
                ) {
                    OutlinedTextField(
                        value = selectedChallenge?.title ?: stringResource(R.string.label_select_challenge),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.label_challenges)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = challengeExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                            .testTag("assignment-challenge-picker"),
                    )
                    ExposedDropdownMenu(
                        expanded = challengeExpanded,
                        onDismissRequest = { challengeExpanded = false },
                    ) {
                        challenges.forEach { challenge ->
                            DropdownMenuItem(
                                text = { Text("${challenge.title} (${challenge.points} pts)") },
                                onClick = {
                                    selectedChallenge = challenge
                                    challengeExpanded = false
                                },
                            )
                        }
                    }
                }

                // Team picker
                ExposedDropdownMenuBox(
                    expanded = teamExpanded,
                    onExpandedChange = { teamExpanded = it },
                ) {
                    OutlinedTextField(
                        value = selectedTeam?.name ?: stringResource(R.string.label_all_teams),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.label_teams)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = teamExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor()
                            .testTag("assignment-team-picker"),
                    )
                    ExposedDropdownMenu(
                        expanded = teamExpanded,
                        onDismissRequest = { teamExpanded = false },
                    ) {
                        if (showAllTeamsOption) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.label_all_teams)) },
                                onClick = {
                                    selectedTeam = null
                                    teamExpanded = false
                                },
                            )
                        }
                        availableTeams.forEach { team ->
                            DropdownMenuItem(
                                text = {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                                    ) {
                                        val teamColor = parseTeamColor(team.color)
                                        Box(
                                            modifier = Modifier
                                                .size(12.dp)
                                                .clip(CircleShape)
                                                .background(teamColor),
                                        )
                                        Text(team.name)
                                    }
                                },
                                onClick = {
                                    selectedTeam = team
                                    teamExpanded = false
                                },
                            )
                        }
                    }
                }

                if (hasAllTeamsAssignment) {
                    Text(
                        text = stringResource(R.string.label_assignment_locked_all_teams),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val base = selectedBase ?: return@Button
                    val challenge = selectedChallenge ?: return@Button
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onConfirm(
                        CreateAssignmentRequest(
                            baseId = base.id,
                            challengeId = challenge.id,
                            teamId = selectedTeam?.id,
                        )
                    )
                },
                enabled = canConfirm,
                modifier = Modifier.testTag("assignment-save-btn"),
            ) {
                Text(stringResource(R.string.label_assign))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}
