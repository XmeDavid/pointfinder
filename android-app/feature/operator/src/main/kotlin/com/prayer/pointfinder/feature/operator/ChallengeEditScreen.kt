package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
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
import androidx.compose.ui.Modifier
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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ChallengeEditScreen(
    challenge: Challenge?,
    bases: List<Base>,
    teams: List<Team>,
    variables: List<TeamVariable>,
    assignments: List<Assignment> = emptyList(),
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
    var points by remember { mutableIntStateOf(challenge?.points ?: 0) }
    var pointsText by remember { mutableStateOf(challenge?.points?.toString() ?: "0") }
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
        val fromAssignment = challenge?.let { ch ->
            assignments.firstOrNull { it.challengeId == ch.id && it.teamId == null }?.baseId
        }
        mutableStateOf(fromAssignment ?: preLinkedBaseId)
    }
    var locationBound by remember { mutableStateOf(challenge?.locationBound ?: false) }
    var unlocksBaseId by remember { mutableStateOf<String?>(challenge?.unlocksBaseId) }

    // Editor state -- alternates between form and rich text editor
    var showDescriptionEditor by remember { mutableStateOf(false) }
    var showContentEditor by remember { mutableStateOf(false) }
    var showCompletionEditor by remember { mutableStateOf(false) }

    // Menu state
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Add answer dialog
    var showAddAnswerDialog by remember { mutableStateOf(false) }
    var newAnswerText by remember { mutableStateOf("") }

    // Dropdown state
    var answerTypeExpanded by remember { mutableStateOf(false) }
    var fixedBaseExpanded by remember { mutableStateOf(false) }
    var unlocksBaseExpanded by remember { mutableStateOf(false) }

    // Show rich text editors as full-screen overlays
    when {
        showDescriptionEditor -> {
            RichTextEditorScreen(
                title = stringResource(R.string.label_description),
                initialHtml = descriptionHtml,
                onDone = { html -> descriptionHtml = html; showDescriptionEditor = false },
                onBack = { showDescriptionEditor = false },
                variables = variables,
                onCreateVariable = onCreateVariable,
                teams = teams,
            )
            return
        }
        showContentEditor -> {
            RichTextEditorScreen(
                title = stringResource(R.string.label_description),
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
                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = null)
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
                onValueChange = { title = it },
                label = { Text(stringResource(R.string.label_challenge_title)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
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
            HtmlPreviewCard(
                html = descriptionHtml,
                onClick = { showDescriptionEditor = true },
            )

            Spacer(Modifier.height(12.dp))

            // Content preview (main rich content)
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
            val answerTypeLabel = if (answerType == "file") {
                stringResource(R.string.label_file_upload)
            } else {
                stringResource(R.string.label_text_input)
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
                        .fillMaxWidth(),
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
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
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
                    bases.forEach { base ->
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

            // Unlocks base dropdown
            val unlocksBaseName = unlocksBaseId?.let { id ->
                bases.firstOrNull { it.id == id }?.name
            } ?: stringResource(R.string.label_none)
            ExposedDropdownMenuBox(
                expanded = unlocksBaseExpanded,
                onExpandedChange = { unlocksBaseExpanded = it },
            ) {
                OutlinedTextField(
                    value = unlocksBaseName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.label_unlocks_base)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = unlocksBaseExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = unlocksBaseExpanded,
                    onDismissRequest = { unlocksBaseExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_none)) },
                        onClick = {
                            unlocksBaseId = null
                            unlocksBaseExpanded = false
                        },
                    )
                    bases.forEach { base ->
                        DropdownMenuItem(
                            text = { Text(base.name) },
                            onClick = {
                                unlocksBaseId = base.id
                                unlocksBaseExpanded = false
                            },
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // Save button
            Button(
                onClick = {
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
                                unlocksBaseId = unlocksBaseId,
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
                                unlocksBaseId = unlocksBaseId,
                            ),
                        )
                    }
                },
                enabled = canSave,
                modifier = Modifier.fillMaxWidth(),
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
