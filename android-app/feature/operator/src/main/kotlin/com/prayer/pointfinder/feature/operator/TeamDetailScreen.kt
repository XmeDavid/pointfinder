package com.prayer.pointfinder.feature.operator

import android.graphics.Bitmap
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.UpdateTeamRequest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamDetailScreen(
    team: Team,
    players: List<PlayerResponse>,
    variables: List<TeamVariable>,
    onSave: (UpdateTeamRequest) -> Unit,
    onDelete: () -> Unit,
    onRemovePlayer: (String) -> Unit,
    onSaveVariableValue: (variableKey: String, value: String) -> Unit,
    onCreateVariable: (variableName: String) -> Unit,
    onDeleteVariable: (variableKey: String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var editedName by remember(team.id) { mutableStateOf(team.name) }
    var editedColor by remember(team.id) { mutableStateOf(team.color) }
    var showMenuExpanded by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showQrDialog by remember { mutableStateOf(false) }
    var removePlayerTarget by remember { mutableStateOf<PlayerResponse?>(null) }
    var newVariableName by remember { mutableStateOf("") }
    var variableError by remember { mutableStateOf<String?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(team.name) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showMenuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.action_more_options))
                        }
                        DropdownMenu(
                            expanded = showMenuExpanded,
                            onDismissRequest = { showMenuExpanded = false },
                        ) {
                            DropdownMenuItem(
                                text = {
                                    Text(
                                        stringResource(R.string.label_delete_team),
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
                                    showMenuExpanded = false
                                    showDeleteDialog = true
                                },
                            )
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
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            // Name
            OutlinedTextField(
                value = editedName,
                onValueChange = { editedName = it },
                label = { Text(stringResource(R.string.label_team_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(12.dp))

            // Color picker
            Text(
                text = stringResource(R.string.label_team_color),
                style = MaterialTheme.typography.labelMedium,
            )
            Spacer(Modifier.height(8.dp))
            ColorPickerRow(
                selectedColor = editedColor,
                onSelectColor = { editedColor = it },
            )

            Spacer(Modifier.height(20.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            // Join code section
            Text(
                text = stringResource(R.string.label_join_code_section),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            val joinCode = team.joinCode
            if (!joinCode.isNullOrBlank()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = joinCode,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f),
                    )
                    IconButton(onClick = { copyToClipboard(context, joinCode) }) {
                        Icon(
                            Icons.Default.ContentCopy,
                            contentDescription = stringResource(R.string.label_copied),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    IconButton(onClick = { showQrDialog = true }) {
                        Icon(
                            Icons.Default.QrCode,
                            contentDescription = stringResource(R.string.label_show_qr),
                            modifier = Modifier.size(20.dp),
                        )
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            // Variables section
            Text(
                text = stringResource(R.string.label_variables),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            if (variables.isEmpty()) {
                Text(
                    text = stringResource(R.string.label_no_variables),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                variables.forEach { variable ->
                    val currentValue = variable.teamValues[team.id] ?: ""
                    var editedValue by remember(variable.key, team.id) { mutableStateOf(currentValue) }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        OutlinedTextField(
                            value = editedValue,
                            onValueChange = { newVal ->
                                editedValue = newVal
                                onSaveVariableValue(variable.key, newVal)
                            },
                            label = { Text(variable.key) },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { onDeleteVariable(variable.key) }) {
                            Icon(
                                Icons.Default.Delete,
                                contentDescription = stringResource(R.string.action_remove),
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }

            // Add variable
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedTextField(
                    value = newVariableName,
                    onValueChange = {
                        newVariableName = it
                        variableError = null
                    },
                    label = { Text(stringResource(R.string.label_variable_name)) },
                    singleLine = true,
                    isError = variableError != null,
                    modifier = Modifier.weight(1f),
                )
                Spacer(Modifier.width(8.dp))
                IconButton(
                    onClick = {
                        val trimmed = newVariableName.trim()
                        when {
                            trimmed.isEmpty() -> {}
                            !trimmed.matches(Regex("^[A-Za-z][A-Za-z0-9_]*$")) -> {
                                variableError = context.getString(R.string.label_invalid_variable_name)
                            }
                            variables.any { it.key.equals(trimmed, ignoreCase = true) } -> {
                                variableError = context.getString(R.string.label_duplicate_variable)
                            }
                            else -> {
                                onCreateVariable(trimmed)
                                newVariableName = ""
                                variableError = null
                            }
                        }
                    },
                    enabled = newVariableName.trim().isNotEmpty(),
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = stringResource(R.string.label_create_variable),
                    )
                }
            }
            if (variableError != null) {
                Text(
                    text = variableError!!,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }

            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            // Players section
            Text(
                text = stringResource(R.string.label_players, players.size),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            if (players.isEmpty()) {
                Text(
                    text = stringResource(R.string.label_no_players),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                players.forEach { player ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = player.displayName,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { removePlayerTarget = player }) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = stringResource(R.string.label_remove_player),
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.error,
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // Save button
            Button(
                onClick = {
                    onSave(
                        UpdateTeamRequest(
                            name = editedName.trim(),
                            color = editedColor,
                        ),
                    )
                },
                enabled = editedName.isNotBlank(),
                modifier = Modifier.fillMaxWidth().testTag("team-save-btn"),
            ) {
                Text(stringResource(R.string.action_save))
            }

            Spacer(Modifier.height(16.dp))
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.label_delete_team)) },
            text = { Text(stringResource(R.string.label_delete_team_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    onDelete()
                }) {
                    Text(
                        stringResource(R.string.action_remove),
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

    // Remove player confirmation dialog
    removePlayerTarget?.let { player ->
        AlertDialog(
            onDismissRequest = { removePlayerTarget = null },
            title = { Text(stringResource(R.string.label_remove_player)) },
            text = { Text(stringResource(R.string.label_remove_player_confirm, player.displayName)) },
            confirmButton = {
                TextButton(onClick = {
                    val playerId = player.id
                    removePlayerTarget = null
                    onRemovePlayer(playerId)
                }) {
                    Text(
                        stringResource(R.string.action_remove),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { removePlayerTarget = null }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    // QR code dialog
    val qrJoinCode = team.joinCode
    if (showQrDialog && !qrJoinCode.isNullOrBlank()) {
        QrCodeDialog(
            content = qrJoinCode,
            onDismiss = { showQrDialog = false },
        )
    }
}

@Composable
private fun QrCodeDialog(
    content: String,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.surface,
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.label_qr_code),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = content,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
            val bitmap = remember(content) { generateQrBitmap(content) }
            if (bitmap != null) {
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = stringResource(R.string.label_qr_code),
                    modifier = Modifier.size(280.dp),
                )
            }
            Spacer(Modifier.height(24.dp))
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_done))
            }
        }
        }
    }
}

internal fun generateQrBitmap(content: String, size: Int = 512): Bitmap? {
    return try {
        val writer = QRCodeWriter()
        val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, size, size)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.RGB_565)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(
                    x, y,
                    if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE,
                )
            }
        }
        bitmap
    } catch (_: Exception) {
        null
    }
}
