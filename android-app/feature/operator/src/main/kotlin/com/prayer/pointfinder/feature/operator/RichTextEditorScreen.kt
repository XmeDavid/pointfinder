package com.prayer.pointfinder.feature.operator

import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.feature.player.HtmlContentView
import kotlinx.coroutines.launch

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
    val editorState = rememberRichTextWebEditorState()
    val scope = rememberCoroutineScope()

    var showOverflowMenu by remember { mutableStateOf(false) }
    var showVariablePicker by remember { mutableStateOf(false) }
    var showCreateVariable by remember { mutableStateOf(false) }
    var showLinkDialog by remember { mutableStateOf(false) }
    var showPreviewTeamPicker by remember { mutableStateOf(false) }
    var previewTeam by remember { mutableStateOf<Team?>(null) }
    var previewHtml by remember { mutableStateOf("") }
    var showAudioSizeError by remember { mutableStateOf(false) }

    val context = LocalContext.current
    val audioLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        val bytes = context.contentResolver.openInputStream(uri)?.readBytes()
            ?: return@rememberLauncherForActivityResult
        if (bytes.size > 5 * 1024 * 1024) {
            showAudioSizeError = true
            return@rememberLauncherForActivityResult
        }
        val mime = context.contentResolver.getType(uri) ?: "audio/mpeg"
        val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        editorState.insertHTML(
            "<audio controls style=\"width:100%;margin:0.5em 0\" src=\"data:$mime;base64,$b64\"></audio>"
        )
    }

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
                                Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.action_more_options))
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
                editorState = editorState,
                onLinkClick = { showLinkDialog = true },
                onAudioClick = { audioLauncher.launch("audio/*") },
            )

            HorizontalDivider()

            // Rich text editor area
            RichTextWebEditor(
                state = editorState,
                initialHtml = initialHtml,
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )

            // Done button
            Button(
                onClick = { scope.launch { onDone(editorState.getHTML()) } },
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
                editorState.insertHTML("<span class=\"variable-tag\">{{$key}}</span>&nbsp;")
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
                editorState.insertHTML("<span class=\"variable-tag\">{{$name}}</span>&nbsp;")
                showCreateVariable = false
            },
            onDismiss = { showCreateVariable = false },
        )
    }

    // Link dialog
    if (showLinkDialog) {
        LinkDialog(
            onInsert = { text, url ->
                editorState.insertHTML("<a href=\"$url\">$text</a>")
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
                scope.launch {
                    previewHtml = editorState.getHTML()
                    previewTeam = team
                }
            },
            onDismiss = { showPreviewTeamPicker = false },
        )
    }

    // Preview dialog
    if (previewTeam != null && variables != null) {
        PreviewDialog(
            html = previewHtml,
            team = previewTeam!!,
            variables = variables,
            onDismiss = { previewTeam = null },
        )
    }

    // Audio size error dialog
    if (showAudioSizeError) {
        AlertDialog(
            onDismissRequest = { showAudioSizeError = false },
            title = { Text(stringResource(R.string.error_audio_too_large_title)) },
            text = { Text(stringResource(R.string.error_audio_too_large_message)) },
            confirmButton = {
                TextButton(onClick = { showAudioSizeError = false }) { Text(stringResource(R.string.action_done)) }
            },
        )
    }
}

@Composable
private fun FormattingToolbar(
    editorState: RichTextWebEditorState,
    onLinkClick: () -> Unit,
    onAudioClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 4.dp, vertical = 2.dp),
    ) {
        // Bold
        IconButton(onClick = { editorState.execCommand("bold") }) {
            Icon(Icons.Default.FormatBold, contentDescription = stringResource(R.string.label_bold))
        }

        // Italic
        IconButton(onClick = { editorState.execCommand("italic") }) {
            Icon(Icons.Default.FormatItalic, contentDescription = stringResource(R.string.label_italic))
        }

        // Underline
        IconButton(onClick = { editorState.execCommand("underline") }) {
            Icon(Icons.Default.FormatUnderlined, contentDescription = stringResource(R.string.label_underline))
        }

        // H1
        IconButton(onClick = { editorState.execFormat("formatBlock", "h1") }) {
            Text(stringResource(R.string.label_heading1), style = MaterialTheme.typography.labelLarge)
        }

        // H2
        IconButton(onClick = { editorState.execFormat("formatBlock", "h2") }) {
            Text(stringResource(R.string.label_heading2), style = MaterialTheme.typography.labelLarge)
        }

        // Unordered list
        IconButton(onClick = { editorState.execCommand("insertUnorderedList") }) {
            Icon(Icons.AutoMirrored.Filled.FormatListBulleted, contentDescription = stringResource(R.string.label_bullet_list))
        }

        // Ordered list
        IconButton(onClick = { editorState.execCommand("insertOrderedList") }) {
            Icon(Icons.Default.FormatListNumbered, contentDescription = stringResource(R.string.label_ordered_list))
        }

        // Code span
        IconButton(onClick = { editorState.insertHTML("<code></code>") }) {
            Icon(Icons.Default.Code, contentDescription = stringResource(R.string.label_code))
        }

        // Link
        IconButton(onClick = onLinkClick) {
            Icon(Icons.Default.Link, contentDescription = stringResource(R.string.label_link))
        }

        // Audio
        IconButton(onClick = onAudioClick) {
            Icon(Icons.Default.MusicNote, contentDescription = stringResource(R.string.label_insert_audio))
        }
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
                    items(variables, key = { it.key }) { variable ->
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
                items(teams, key = { it.id }) { team ->
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "${stringResource(R.string.label_preview)} - ${team.name}",
            )
        },
        text = {
            HtmlContentView(
                html = resolvedHtml,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(300.dp),
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_done))
            }
        },
    )
}
