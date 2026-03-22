package com.prayer.pointfinder.feature.operator

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.Checkbox
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateChallengeRequest
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.UpdateChallengeRequest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChallengeEditScreen(
    challenge: Challenge?,
    bases: List<Base>,
    challenges: List<Challenge> = emptyList(),
    teams: List<Team>,
    variables: List<TeamVariable>,
    assignments: List<Assignment> = emptyList(),
    challengeVariables: List<TeamVariable> = emptyList(),
    onSaveChallengeVariables: (suspend (List<TeamVariable>) -> List<TeamVariable>)? = null,
    onSave: (Any) -> Unit,
    onDelete: (() -> Unit)?,
    onBack: () -> Unit,
    preLinkedBaseId: String? = null,
    onCreateVariable: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isEditMode = challenge != null

    // Form state
    var title by remember { mutableStateOf(challenge?.title ?: "") }
    var points by remember { mutableIntStateOf(challenge?.points ?: 100) }
    var pointsText by remember { mutableStateOf(challenge?.points?.toString() ?: "100") }
    var descriptionHtml by remember { mutableStateOf(challenge?.description ?: "") }
    var contentHtml by remember { mutableStateOf(challenge?.content ?: "") }
    var completionContentHtml by remember { mutableStateOf(challenge?.completionContent ?: "") }
    var answerType by remember { mutableStateOf(challenge?.answerType ?: "text") }
    var autoValidate by remember { mutableStateOf(challenge?.autoValidate ?: false) }
    val correctAnswers = remember {
        mutableStateListOf<String>().apply {
            challenge?.correctAnswer?.let { addAll(it) }
        }
    }
    var fixedBaseId by remember {
        val fromBase = challenge?.let { ch ->
            bases.firstOrNull { it.fixedChallengeId == ch.id }?.id
        }
        mutableStateOf(fromBase ?: preLinkedBaseId)
    }
    var requirePresence by remember { mutableStateOf(challenge?.requirePresenceToSubmit ?: false) }
    var locationBound by remember { mutableStateOf(challenge?.locationBound ?: false) }
    val unlocksBaseIds = remember {
        mutableStateListOf<String>().apply {
            challenge?.unlocksBaseIds?.let { addAll(it) }
        }
    }

    // Filter bases for fixed-to-base dropdown: exclude bases that already have a fixed challenge
    val availableBases = remember(bases, challenge?.id) {
        filterAvailableBases(bases, challenge?.id)
    }
    // Filter bases for unlocks-base dropdown: only hidden, exclude own fixed base, exclude already-unlocked
    val availableUnlockBases = remember(bases, challenges, challenge?.id, fixedBaseId) {
        filterAvailableUnlockBases(bases, challenges, challenge?.id, fixedBaseId)
    }

    // Editor state -- alternates between form and rich text editor
    // showDescriptionEditor removed — description is plain text, not rich HTML
    var showContentEditor by remember { mutableStateOf(false) }
    var showCompletionEditor by remember { mutableStateOf(false) }

    // Menu state
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Validation state
    var titleTouched by remember { mutableStateOf(false) }

    // Add answer dialog
    var showAddAnswerDialog by remember { mutableStateOf(false) }
    var newAnswerText by remember { mutableStateOf("") }

    // Dropdown state
    var answerTypeExpanded by remember { mutableStateOf(false) }
    var fixedBaseExpanded by remember { mutableStateOf(false) }
    var unlocksBaseExpanded by remember { mutableStateOf(false) }

    // Show rich text editors as full-screen overlays
    when {
        showContentEditor -> {
            RichTextEditorScreen(
                title = stringResource(R.string.label_content),
                initialHtml = contentHtml,
                onDone = { html -> contentHtml = html; showContentEditor = false },
                onBack = { showContentEditor = false },
                variables = variables,
                onCreateVariable = onCreateVariable,
                teams = teams,
            )
            return
        }
        showCompletionEditor -> {
            RichTextEditorScreen(
                title = stringResource(R.string.label_completion_message),
                initialHtml = completionContentHtml,
                onDone = { html -> completionContentHtml = html; showCompletionEditor = false },
                onBack = { showCompletionEditor = false },
                variables = variables,
                onCreateVariable = onCreateVariable,
                teams = teams,
            )
            return
        }
    }

    val screenTitle = if (isEditMode) stringResource(R.string.label_edit_challenge) else stringResource(R.string.label_new_challenge)
    val canSave = title.isNotBlank()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(screenTitle) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (isEditMode && onDelete != null) {
                        Box {
                            IconButton(onClick = { showOverflowMenu = true }, modifier = Modifier.testTag("challenge-overflow-btn")) {
                                Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.action_more_options))
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            stringResource(R.string.label_delete_challenge),
                                            color = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.error,
                                        )
                                    },
                                    onClick = {
                                        showOverflowMenu = false
                                        showDeleteDialog = true
                                    },
                                    modifier = Modifier.testTag("challenge-delete-btn"),
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            // Title field
            OutlinedTextField(
                value = title,
                onValueChange = { title = it; titleTouched = true },
                label = { Text(stringResource(R.string.label_challenge_title)) },
                singleLine = true,
                isError = titleTouched && title.isBlank(),
                supportingText = if (titleTouched && title.isBlank()) {
                    { Text(stringResource(R.string.error_title_required)) }
                } else null,
                modifier = Modifier.fillMaxWidth().testTag("challenge-title-input"),
            )

            Spacer(Modifier.height(12.dp))

            // Points field
            OutlinedTextField(
                value = pointsText,
                onValueChange = { value ->
                    pointsText = value
                    points = value.toIntOrNull() ?: 0
                },
                label = { Text(stringResource(R.string.label_challenge_points)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))

            // Content section header
            SectionHeader(stringResource(R.string.label_content))

            Spacer(Modifier.height(8.dp))

            // Description preview
            Text(
                text = stringResource(R.string.label_description),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            OutlinedTextField(
                value = descriptionHtml,
                onValueChange = { descriptionHtml = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                placeholder = { Text(stringResource(R.string.label_description)) },
            )

            Spacer(Modifier.height(12.dp))

            // Content preview (main rich content) — hidden for check-in only
            if (answerType != "none") {
                Text(
                    text = stringResource(R.string.label_content),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                HtmlPreviewCard(
                    html = contentHtml,
                    onClick = { showContentEditor = true },
                )

                Spacer(Modifier.height(12.dp))
            }

            // Completion Message preview
            Text(
                text = stringResource(R.string.label_completion_message),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            HtmlPreviewCard(
                html = completionContentHtml,
                onClick = { showCompletionEditor = true },
            )

            Spacer(Modifier.height(20.dp))

            // Answer section header
            SectionHeader(stringResource(R.string.label_answer))

            Spacer(Modifier.height(8.dp))

            // Answer type dropdown
            val answerTypeLabel = when (answerType) {
                "file" -> stringResource(R.string.label_file_upload)
                "none" -> stringResource(R.string.label_check_in_only)
                else -> stringResource(R.string.label_text_input)
            }
            ExposedDropdownMenuBox(
                expanded = answerTypeExpanded,
                onExpandedChange = { answerTypeExpanded = it },
            ) {
                OutlinedTextField(
                    value = answerTypeLabel,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.label_answer_type_label)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = answerTypeExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth()
                        .testTag("challenge-type-select"),
                )
                ExposedDropdownMenu(
                    expanded = answerTypeExpanded,
                    onDismissRequest = { answerTypeExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_text_input)) },
                        onClick = {
                            answerType = "text"
                            answerTypeExpanded = false
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_file_upload)) },
                        onClick = {
                            answerType = "file"
                            autoValidate = false
                            answerTypeExpanded = false
                        },
                    )
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_check_in_only)) },
                        onClick = {
                            answerType = "none"
                            autoValidate = false
                            requirePresence = false
                            answerTypeExpanded = false
                        },
                        enabled = !requirePresence,
                    )
                }
            }

            // Require presence toggle (hidden when answerType is "none")
            if (answerType != "none") {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.label_require_presence),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Switch(
                        checked = requirePresence,
                        onCheckedChange = { requirePresence = it },
                    )
                }
            }

            // Auto-validate toggle (only for text type)
            if (answerType == "text") {
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = stringResource(R.string.label_auto_validate),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    Switch(
                        checked = autoValidate,
                        onCheckedChange = { autoValidate = it },
                    )
                }

                // Correct answers chips
                if (autoValidate) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.label_correct_answers),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        correctAnswers.forEachIndexed { index, answer ->
                            AssistChip(
                                onClick = { correctAnswers.removeAt(index) },
                                label = { Text(answer) },
                                trailingIcon = {
                                    Icon(
                                        Icons.Default.Close,
                                        contentDescription = stringResource(R.string.action_remove),
                                        modifier = Modifier.size(16.dp),
                                    )
                                },
                            )
                        }
                        AssistChip(
                            onClick = {
                                newAnswerText = ""
                                showAddAnswerDialog = true
                            },
                            label = { Text("+") },
                            leadingIcon = {
                                Icon(
                                    Icons.Default.Add,
                                    contentDescription = stringResource(R.string.label_add_answer),
                                    modifier = Modifier.size(16.dp),
                                )
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // Linking section header
            SectionHeader(stringResource(R.string.label_linking))

            Spacer(Modifier.height(8.dp))

            // Fixed to base dropdown
            val fixedBaseName = fixedBaseId?.let { id ->
                bases.firstOrNull { it.id == id }?.name
            } ?: stringResource(R.string.label_none)
            ExposedDropdownMenuBox(
                expanded = fixedBaseExpanded,
                onExpandedChange = { fixedBaseExpanded = it },
            ) {
                OutlinedTextField(
                    value = fixedBaseName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.label_fixed_to_base)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fixedBaseExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = fixedBaseExpanded,
                    onDismissRequest = { fixedBaseExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_none)) },
                        onClick = {
                            fixedBaseId = null
                            fixedBaseExpanded = false
                        },
                    )
                    availableBases.forEach { base ->
                        DropdownMenuItem(
                            text = { Text(base.name) },
                            onClick = {
                                fixedBaseId = base.id
                                fixedBaseExpanded = false
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Location-bound toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.label_location_bound),
                    style = MaterialTheme.typography.bodyLarge,
                )
                Switch(
                    checked = locationBound,
                    onCheckedChange = { locationBound = it },
                )
            }

            Spacer(Modifier.height(8.dp))

            // Unlocks bases multi-select (expandable section)
            var unlocksExpanded by remember { mutableStateOf(unlocksBaseIds.isNotEmpty()) }
            val selectedCount = unlocksBaseIds.size

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { unlocksExpanded = !unlocksExpanded }
                    .padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text(
                        text = stringResource(R.string.label_unlocks_base),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    if (selectedCount > 0 && !unlocksExpanded) {
                        Text(
                            text = "$selectedCount selected",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
                Icon(
                    imageVector = if (unlocksExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                    contentDescription = if (unlocksExpanded) "Collapse" else "Expand",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            AnimatedVisibility(visible = unlocksExpanded) {
                Column {
                    if (availableUnlockBases.isEmpty()) {
                        Text(
                            text = stringResource(R.string.label_none),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 8.dp, top = 4.dp),
                        )
                    } else {
                        availableUnlockBases.forEach { base ->
                            val checked = base.id in unlocksBaseIds
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable {
                                        if (checked) unlocksBaseIds.remove(base.id)
                                        else unlocksBaseIds.add(base.id)
                                    }
                                    .padding(vertical = 6.dp, horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Checkbox(
                                    checked = checked,
                                    onCheckedChange = { isOn ->
                                        if (isOn) unlocksBaseIds.add(base.id)
                                        else unlocksBaseIds.remove(base.id)
                                    },
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = base.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                )
                            }
                        }
                    }
                }
            }

            // Challenge Variables section (only in edit mode when callback provided)
            if (isEditMode && onSaveChallengeVariables != null) {
                Spacer(Modifier.height(20.dp))

                SectionHeader(stringResource(R.string.label_challenge_variables))

                Spacer(Modifier.height(8.dp))

                TeamVariablesEditorSection(
                    teams = teams,
                    variables = challengeVariables,
                    onSave = onSaveChallengeVariables,
                )
            }

            Spacer(Modifier.height(24.dp))

            // Save button
            Button(
                onClick = {
                    val effectiveUnlocksBaseIds = unlocksBaseIds.toList().ifEmpty { null }
                    if (isEditMode) {
                        onSave(
                            UpdateChallengeRequest(
                                title = title,
                                description = descriptionHtml,
                                content = contentHtml,
                                completionContent = completionContentHtml,
                                answerType = answerType,
                                autoValidate = autoValidate,
                                correctAnswer = correctAnswers.toList(),
                                points = points,
                                locationBound = locationBound,
                                fixedBaseId = fixedBaseId,
                                unlocksBaseIds = effectiveUnlocksBaseIds,
                                requirePresenceToSubmit = requirePresence,
                            ),
                        )
                    } else {
                        onSave(
                            CreateChallengeRequest(
                                title = title,
                                description = descriptionHtml,
                                content = contentHtml,
                                completionContent = completionContentHtml,
                                answerType = answerType,
                                autoValidate = autoValidate,
                                correctAnswer = correctAnswers.toList(),
                                points = points,
                                locationBound = locationBound,
                                fixedBaseId = fixedBaseId,
                                unlocksBaseIds = effectiveUnlocksBaseIds,
                                requirePresenceToSubmit = requirePresence,
                            ),
                        )
                    }
                },
                enabled = canSave,
                modifier = Modifier.fillMaxWidth().testTag("challenge-save-btn"),
            ) {
                Text(stringResource(R.string.action_save))
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog && onDelete != null) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.label_delete_challenge)) },
            text = { Text(stringResource(R.string.label_delete_challenge_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    onDelete()
                }) {
                    Text(
                        stringResource(R.string.label_delete_challenge),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    // Add answer dialog
    if (showAddAnswerDialog) {
        AlertDialog(
            onDismissRequest = { showAddAnswerDialog = false },
            title = { Text(stringResource(R.string.label_add_answer)) },
            text = {
                OutlinedTextField(
                    value = newAnswerText,
                    onValueChange = { newAnswerText = it },
                    label = { Text(stringResource(R.string.label_answer)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        if (newAnswerText.isNotBlank()) {
                            correctAnswers.add(newAnswerText.trim())
                            newAnswerText = ""
                        }
                        showAddAnswerDialog = false
                    },
                    enabled = newAnswerText.isNotBlank(),
                ) {
                    Text(stringResource(R.string.label_add_answer))
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddAnswerDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun SectionHeader(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HorizontalDivider(modifier = Modifier.weight(1f))
        Text(
            text = text,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        HorizontalDivider(modifier = Modifier.weight(1f))
    }
}

@Composable
private fun HtmlPreviewCard(
    html: String,
    onClick: () -> Unit,
) {
    val previewText = stripHtml(html)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        tonalElevation = 2.dp,
        shape = MaterialTheme.shapes.medium,
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(
                text = previewText.ifBlank { stringResource(R.string.label_no_content) },
                style = MaterialTheme.typography.bodyMedium,
                color = if (previewText.isBlank()) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.onSurface
                },
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(4.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onClick) {
                    Text(stringResource(R.string.action_edit))
                }
            }
        }
    }
}

private fun stripHtml(html: String): String {
    return html.replace(Regex("<[^>]*>"), "").replace("&nbsp;", " ").trim()
}

/**
 * Filters bases for the fixed-to-base dropdown on a challenge edit screen.
 * Excludes bases that already have a fixedChallengeId assigned,
 * unless it matches the challenge being edited.
 */
internal fun filterAvailableBases(
    bases: List<Base>,
    editingChallengeId: String?,
): List<Base> {
    return bases.filter { base ->
        base.fixedChallengeId == null || base.fixedChallengeId == editingChallengeId
    }
}

/**
 * Filters bases for the unlocks-base multi-select on a challenge edit screen.
 * Only shows hidden bases, excludes the challenge's own fixed base,
 * and excludes bases already unlocked by other challenges.
 */
internal fun filterAvailableUnlockBases(
    bases: List<Base>,
    challenges: List<Challenge>,
    editingChallengeId: String?,
    fixedBaseId: String?,
): List<Base> {
    val alreadyUnlockedBaseIds = challenges
        .filter { it.id != editingChallengeId }
        .flatMap { it.unlocksBaseIds ?: emptyList() }
        .toSet()
    return bases.filter { base ->
        base.hidden && base.id != fixedBaseId && base.id !in alreadyUnlockedBaseIds
    }
}
