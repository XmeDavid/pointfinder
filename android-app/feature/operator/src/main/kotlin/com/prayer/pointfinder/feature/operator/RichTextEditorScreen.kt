package com.prayer.pointfinder.feature.operator

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.filled.Code
import androidx.compose.material.icons.filled.FormatBold
import androidx.compose.material.icons.filled.FormatItalic
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.FormatUnderlined
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mohamedrejeb.richeditor.model.rememberRichTextState
import com.mohamedrejeb.richeditor.ui.material3.RichTextEditor
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamVariable

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RichTextEditorScreen(
    title: String,
    initialHtml: String,
    onDone: (String) -> Unit,
    onBack: () -> Unit,
    variables: List<TeamVariable>? = null,
    onCreateVariable: ((String) -> Unit)? = null,
    teams: List<Team>? = null,
) {
    val richTextState = rememberRichTextState()

    LaunchedEffect(Unit) {
        richTextState.setHtml(initialHtml)
    }

    var showOverflowMenu by remember { mutableStateOf(false) }
    var showVariablePicker by remember { mutableStateOf(false) }
    var showCreateVariable by remember { mutableStateOf(false) }
    var showLinkDialog by remember { mutableStateOf(false) }
    var showPreviewTeamPicker by remember { mutableStateOf(false) }
    var previewTeam by remember { mutableStateOf<Team?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.action_back),
                        )
                    }
                },
                actions = {
                    if (variables != null || onCreateVariable != null || teams != null) {
                        Box {
                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = null)
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false },
                            ) {
                                if (variables != null) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.label_insert_variable)) },
                                        onClick = {
                                            showOverflowMenu = false
                                            showVariablePicker = true
                                        },
                                    )
                                }
                                if (onCreateVariable != null) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.label_create_variable)) },
                                        onClick = {
                                            showOverflowMenu = false
                                            showCreateVariable = true
                                        },
                                    )
                                }
                                if (teams != null && teams.isNotEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text(stringResource(R.string.label_preview_as_team)) },
                                        onClick = {
                                            showOverflowMenu = false
                                            showPreviewTeamPicker = true
                                        },
                                    )
                                }
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Formatting toolbar
            FormattingToolbar(
                richTextState = richTextState,
                onLinkClick = { showLinkDialog = true },
            )

            HorizontalDivider()

            // Rich text editor area
            RichTextEditor(
                state = richTextState,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )

            // Done button
            Button(
                onClick = { onDone(richTextState.toHtml()) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Text(stringResource(R.string.action_done))
            }
        }
    }

    // Variable picker dialog
    if (showVariablePicker && variables != null) {
        VariablePickerDialog(
            variables = variables,
            onSelect = { key ->
                richTextState.addTextAfterSelection("{{$key}}")
                showVariablePicker = false
            },
            onDismiss = { showVariablePicker = false },
        )
    }

    // Create variable dialog
    if (showCreateVariable && onCreateVariable != null) {
        CreateVariableDialog(
            onCreate = { name ->
                onCreateVariable(name)
                richTextState.addTextAfterSelection("{{$name}}")
                showCreateVariable = false
            },
            onDismiss = { showCreateVariable = false },
        )
    }

    // Link dialog
    if (showLinkDialog) {
        LinkDialog(
            onInsert = { text, url ->
                richTextState.addLink(text = text, url = url)
                showLinkDialog = false
            },
            onDismiss = { showLinkDialog = false },
        )
    }

    // Preview team picker dialog
    if (showPreviewTeamPicker && teams != null) {
        TeamPickerDialog(
            teams = teams,
            onSelect = { team ->
                showPreviewTeamPicker = false
                previewTeam = team
            },
            onDismiss = { showPreviewTeamPicker = false },
        )
    }

    // Preview dialog
    if (previewTeam != null && variables != null) {
        PreviewDialog(
            html = richTextState.toHtml(),
            team = previewTeam!!,
            variables = variables,
            onDismiss = { previewTeam = null },
        )
    }
}

@Composable
private fun FormattingToolbar(
    richTextState: com.mohamedrejeb.richeditor.model.RichTextState,
    onLinkClick: () -> Unit,
) {
    val currentSpanStyle = richTextState.currentSpanStyle
    val isBold = currentSpanStyle.fontWeight == FontWeight.Bold
    val isItalic = currentSpanStyle.fontStyle == FontStyle.Italic
    val isUnderline = currentSpanStyle.textDecoration == TextDecoration.Underline

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 4.dp, vertical = 2.dp),
    ) {
        // Bold
        ToolbarButton(
            onClick = { richTextState.toggleSpanStyle(SpanStyle(fontWeight = FontWeight.Bold)) },
            isActive = isBold,
            contentDescription = stringResource(R.string.label_bold),
        ) {
            Icon(Icons.Default.FormatBold, contentDescription = null)
        }

        // Italic
        ToolbarButton(
            onClick = { richTextState.toggleSpanStyle(SpanStyle(fontStyle = FontStyle.Italic)) },
            isActive = isItalic,
            contentDescription = stringResource(R.string.label_italic),
        ) {
            Icon(Icons.Default.FormatItalic, contentDescription = null)
        }

        // Underline
        ToolbarButton(
            onClick = { richTextState.toggleSpanStyle(SpanStyle(textDecoration = TextDecoration.Underline)) },
            isActive = isUnderline,
            contentDescription = stringResource(R.string.label_underline),
        ) {
            Icon(Icons.Default.FormatUnderlined, contentDescription = null)
        }

        // H1 (large font size)
        val isH1 = currentSpanStyle.fontSize == 24.sp
        ToolbarButton(
            onClick = { richTextState.toggleSpanStyle(SpanStyle(fontSize = 24.sp)) },
            isActive = isH1,
            contentDescription = stringResource(R.string.label_heading1),
        ) {
            Text("H1", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        }

        // H2 (medium-large font size)
        val isH2 = currentSpanStyle.fontSize == 20.sp
        ToolbarButton(
            onClick = { richTextState.toggleSpanStyle(SpanStyle(fontSize = 20.sp)) },
            isActive = isH2,
            contentDescription = stringResource(R.string.label_heading2),
        ) {
            Text("H2", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
        }

        // Unordered list
        ToolbarButton(
            onClick = { richTextState.toggleUnorderedList() },
            isActive = richTextState.isUnorderedList,
            contentDescription = stringResource(R.string.label_bullet_list),
        ) {
            Icon(Icons.AutoMirrored.Filled.FormatListBulleted, contentDescription = null)
        }

        // Ordered list
        ToolbarButton(
            onClick = { richTextState.toggleOrderedList() },
            isActive = richTextState.isOrderedList,
            contentDescription = stringResource(R.string.label_ordered_list),
        ) {
            Icon(Icons.Default.FormatListNumbered, contentDescription = null)
        }

        // Code span
        ToolbarButton(
            onClick = { richTextState.toggleCodeSpan() },
            isActive = richTextState.isCodeSpan,
            contentDescription = stringResource(R.string.label_code),
        ) {
            Icon(Icons.Default.Code, contentDescription = null)
        }

        // Link
        ToolbarButton(
            onClick = onLinkClick,
            isActive = richTextState.isLink,
            contentDescription = stringResource(R.string.label_link),
        ) {
            Icon(Icons.Default.Link, contentDescription = null)
        }
    }
}

@Composable
private fun ToolbarButton(
    onClick: () -> Unit,
    isActive: Boolean,
    contentDescription: String,
    content: @Composable () -> Unit,
) {
    IconButton(
        onClick = onClick,
        colors = if (isActive) {
            IconButtonDefaults.iconButtonColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        } else {
            IconButtonDefaults.iconButtonColors()
        },
    ) {
        content()
    }
}

@Composable
private fun VariablePickerDialog(
    variables: List<TeamVariable>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_insert_variable)) },
        text = {
            if (variables.isEmpty()) {
                Text(stringResource(R.string.label_no_variables))
            } else {
                LazyColumn {
                    items(variables) { variable ->
                        TextButton(
                            onClick = { onSelect(variable.key) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                text = "{{${variable.key}}}",
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

@Composable
private fun CreateVariableDialog(
    onCreate: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var variableName by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_create_variable)) },
        text = {
            OutlinedTextField(
                value = variableName,
                onValueChange = { variableName = it },
                label = { Text(stringResource(R.string.label_variable_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(
                onClick = { if (variableName.isNotBlank()) onCreate(variableName.trim()) },
                enabled = variableName.isNotBlank(),
            ) {
                Text(stringResource(R.string.action_create))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

@Composable
private fun LinkDialog(
    onInsert: (text: String, url: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var linkText by remember { mutableStateOf("") }
    var linkUrl by remember { mutableStateOf("https://") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_link)) },
        text = {
            Column {
                OutlinedTextField(
                    value = linkText,
                    onValueChange = { linkText = it },
                    label = { Text(stringResource(R.string.label_link_text)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = linkUrl,
                    onValueChange = { linkUrl = it },
                    label = { Text(stringResource(R.string.label_url)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (linkText.isNotBlank() && linkUrl.isNotBlank()) {
                        onInsert(linkText.trim(), linkUrl.trim())
                    }
                },
                enabled = linkText.isNotBlank() && linkUrl.isNotBlank(),
            ) {
                Text(stringResource(R.string.action_done))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

@Composable
private fun TeamPickerDialog(
    teams: List<Team>,
    onSelect: (Team) -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.label_select_team)) },
        text = {
            LazyColumn {
                items(teams) { team ->
                    TextButton(
                        onClick = { onSelect(team) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            text = team.name,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

@Composable
private fun PreviewDialog(
    html: String,
    team: Team,
    variables: List<TeamVariable>,
    onDismiss: () -> Unit,
) {
    val resolvedHtml = remember(html, team, variables) {
        var result = html
        for (variable in variables) {
            val value = variable.teamValues[team.id] ?: variable.teamValues[team.name] ?: ""
            result = result.replace("{{${variable.key}}}", value)
        }
        result
    }

    val previewState = rememberRichTextState()
    LaunchedEffect(resolvedHtml) {
        previewState.setHtml(resolvedHtml)
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "${stringResource(R.string.label_preview)} - ${team.name}",
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp),
            ) {
                com.mohamedrejeb.richeditor.ui.material3.RichTextEditor(
                    state = previewState,
                    readOnly = true,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_done))
            }
        },
    )
}
