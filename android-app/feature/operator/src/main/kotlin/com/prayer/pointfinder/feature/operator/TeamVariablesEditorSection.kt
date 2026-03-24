package com.prayer.pointfinder.feature.operator

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamVariable
import kotlinx.coroutines.launch

/**
 * Normalize variables so every team has an entry in every variable's teamValues map.
 */
internal fun normalizedTeamVariables(
    variables: List<TeamVariable>,
    teams: List<Team>,
): List<TeamVariable> {
    val teamIds = teams.map { it.id }
    val allowedTeamIds = teamIds.toSet()
    return variables.map { variable ->
        val teamValues = variable.teamValues.filterKeys { it in allowedTeamIds }.toMutableMap()
        for (teamId in teamIds) {
            if (teamId !in teamValues) {
                teamValues[teamId] = ""
            }
        }
        TeamVariable(key = variable.key, teamValues = teamValues)
    }
}

/**
 * Reusable composable for editing team variables.
 * Used by both ChallengeEditScreen (challenge-scoped) and TeamVariablesManagementScreen (game-scoped).
 */
@Composable
fun TeamVariablesEditorSection(
    teams: List<Team>,
    variables: List<TeamVariable>,
    onSave: (suspend (List<TeamVariable>) -> List<TeamVariable>)? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Working copy of variables (normalized)
    var workingVariables by remember(variables, teams) {
        mutableStateOf(normalizedTeamVariables(variables, teams))
    }
    // Baseline to detect changes
    var baseline by remember(variables, teams) {
        mutableStateOf(normalizedTeamVariables(variables, teams))
    }
    // Expanded keys
    var expandedKeys by remember(variables) {
        mutableStateOf(variables.map { it.key }.toSet())
    }

    var newVariableName by remember { mutableStateOf("") }
    var keyError by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }

    val hasChanges = workingVariables != baseline

    Column(modifier = modifier.fillMaxWidth()) {
        // Empty states
        if (teams.isEmpty()) {
            Text(
                text = stringResource(R.string.label_no_teams_in_game),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (workingVariables.isEmpty()) {
            Text(
                text = stringResource(R.string.label_no_variables),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        // Variable sections
        workingVariables.forEach { variable ->
            val isExpanded = variable.key in expandedKeys
            Spacer(Modifier.height(8.dp))

            // Header row: {{KEY}} + expand/collapse + delete
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        expandedKeys = if (isExpanded) {
                            expandedKeys - variable.key
                        } else {
                            expandedKeys + variable.key
                        }
                    }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "{{${variable.key}}}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                IconButton(
                    onClick = {
                        workingVariables = workingVariables.filter { it.key != variable.key }
                        expandedKeys = expandedKeys - variable.key
                        errorMessage = null
                    },
                    modifier = Modifier.size(32.dp),
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = stringResource(R.string.action_remove),
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
                Icon(
                    if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = stringResource(if (isExpanded) R.string.cd_collapse else R.string.cd_expand),
                    modifier = Modifier.size(20.dp),
                )
            }

            // Expanded: per-team TextFields
            AnimatedVisibility(visible = isExpanded) {
                Column(
                    modifier = Modifier.padding(start = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    teams.forEach { team ->
                        val teamId = team.id
                        val currentValue = variable.teamValues[teamId] ?: ""
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(parseTeamColor(team.color)),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                text = team.name,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.width(80.dp),
                                maxLines = 1,
                            )
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = currentValue,
                                onValueChange = { newValue ->
                                    workingVariables = workingVariables.map { v ->
                                        if (v.key == variable.key) {
                                            val updated = v.teamValues.toMutableMap()
                                            updated[teamId] = newValue
                                            v.copy(teamValues = updated)
                                        } else {
                                            v
                                        }
                                    }
                                },
                                singleLine = true,
                                modifier = Modifier.weight(1f),
                                textStyle = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
            HorizontalDivider(modifier = Modifier.padding(top = 4.dp))
        }

        Spacer(Modifier.height(12.dp))

        // Create variable section
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            OutlinedTextField(
                value = newVariableName,
                onValueChange = {
                    newVariableName = it
                    keyError = null
                },
                label = { Text(stringResource(R.string.label_variable_name)) },
                singleLine = true,
                isError = keyError != null,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = {
                    val trimmed = newVariableName.trim()
                    when {
                        trimmed.isEmpty() -> {}
                        !trimmed.matches(Regex("^[A-Za-z][A-Za-z0-9_]*$")) -> {
                            keyError = context.getString(R.string.label_invalid_variable_name)
                        }
                        workingVariables.any { it.key.equals(trimmed, ignoreCase = true) } -> {
                            keyError = context.getString(R.string.label_duplicate_variable)
                        }
                        else -> {
                            val teamValues = teams.associate { it.id to "" }
                            workingVariables = workingVariables + TeamVariable(key = trimmed, teamValues = teamValues)
                            expandedKeys = expandedKeys + trimmed
                            newVariableName = ""
                            keyError = null
                            errorMessage = null
                        }
                    }
                },
                enabled = newVariableName.trim().isNotEmpty() && teams.isNotEmpty(),
            ) {
                Icon(
                    Icons.Default.Add,
                    contentDescription = stringResource(R.string.label_create_variable),
                )
            }
        }
        if (keyError != null) {
            Text(
                text = keyError!!,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        // Save button (only when changes detected and onSave provided)
        if (hasChanges && onSave != null) {
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    scope.launch {
                        isSaving = true
                        errorMessage = null
                        try {
                            val saved = onSave(workingVariables)
                            val normalized = normalizedTeamVariables(saved, teams)
                            workingVariables = normalized
                            baseline = normalized
                            expandedKeys = normalized.map { it.key }.toSet()
                        } catch (e: Exception) {
                            errorMessage = e.message ?: "Save failed"
                        }
                        isSaving = false
                    }
                },
                enabled = !isSaving && teams.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.label_saving))
                } else {
                    Text(stringResource(R.string.action_save))
                }
            }
        }

        // Error display
        if (errorMessage != null) {
            Spacer(Modifier.height(4.dp))
            Text(
                text = errorMessage!!,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}
