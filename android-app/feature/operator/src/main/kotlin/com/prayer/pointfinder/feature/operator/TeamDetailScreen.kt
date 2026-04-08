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
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.BaseUnlockOverrideResponse
import com.prayer.pointfinder.core.model.PlayerResponse
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamVariable
import com.prayer.pointfinder.core.model.UpdateTeamRequest

private const val REASON_MAX_LENGTH = 500

// Amber color for mark-completed / manual check-in — rescue overrides
private val AmberAction = Color(0xFFE08A00)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamDetailScreen(
    team: Team,
    players: List<PlayerResponse>,
    variables: List<TeamVariable>,
    bases: List<Base> = emptyList(),
    teamProgress: List<TeamBaseProgressResponse> = emptyList(),
    unlockOverrides: List<BaseUnlockOverrideResponse> = emptyList(),
    onSave: (UpdateTeamRequest) -> Unit,
    onDelete: () -> Unit,
    onRemovePlayer: (String) -> Unit,
    onSaveVariableValue: (variableKey: String, value: String) -> Unit,
    onCreateVariable: (variableName: String) -> Unit,
    onDeleteVariable: (variableKey: String) -> Unit,
    onMarkCompleted: (baseId: String, challengeId: String, reason: String?, pointsOverride: Int?) -> Unit,
    onManualCheckIn: (baseId: String) -> Unit,
    onGrantOverride: (baseId: String, reason: String?) -> Unit,
    onRemoveOverride: (baseId: String) -> Unit,
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

    // Rescue action dialogs
    var markCompletedTarget by remember { mutableStateOf<Base?>(null) }
    var overrideGrantTarget by remember { mutableStateOf<Base?>(null) }
    var removeOverrideTarget by remember { mutableStateOf<Base?>(null) }
    var manualCheckInTarget by remember { mutableStateOf<Base?>(null) }

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
                                        contentDescription = stringResource(R.string.cd_delete),
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

            Spacer(Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(Modifier.height(12.dp))

            // Base Progress & Rescue Actions
            Text(
                text = stringResource(R.string.label_base_progress),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(8.dp))
            if (bases.isEmpty()) {
                Text(
                    text = stringResource(R.string.label_no_bases_in_game),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                bases.forEach { base ->
                    val prog = teamProgress.firstOrNull { it.baseId == base.id }
                    val override = unlockOverrides.firstOrNull { it.baseId == base.id }
                    BaseProgressRow(
                        base = base,
                        progress = prog,
                        override = override,
                        onMarkCompleted = { markCompletedTarget = base },
                        onManualCheckIn = { manualCheckInTarget = base },
                        onGrantOverride = { overrideGrantTarget = base },
                        onRemoveOverride = { removeOverrideTarget = base },
                    )
                    Spacer(Modifier.height(4.dp))
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

    // Manual check-in dialog
    manualCheckInTarget?.let { base ->
        ManualCheckInDialog(
            baseName = base.name,
            onConfirm = {
                manualCheckInTarget = null
                onManualCheckIn(base.id)
            },
            onDismiss = { manualCheckInTarget = null },
        )
    }

    // Mark-completed dialog
    markCompletedTarget?.let { base ->
        val challengeId = teamProgress.firstOrNull { it.baseId == base.id }?.challengeId
        MarkCompletedDialog(
            baseName = base.name,
            challengeId = challengeId,
            onConfirm = { reason, pointsOverride ->
                markCompletedTarget = null
                if (challengeId != null) {
                    onMarkCompleted(base.id, challengeId, reason, pointsOverride)
                }
            },
            onDismiss = { markCompletedTarget = null },
        )
    }

    // Grant override dialog
    overrideGrantTarget?.let { base ->
        GrantOverrideDialog(
            baseName = base.name,
            onConfirm = { reason ->
                overrideGrantTarget = null
                onGrantOverride(base.id, reason)
            },
            onDismiss = { overrideGrantTarget = null },
        )
    }

    // Remove override confirmation dialog
    removeOverrideTarget?.let { base ->
        AlertDialog(
            onDismissRequest = { removeOverrideTarget = null },
            title = { Text(stringResource(R.string.label_remove_override_confirm_title)) },
            text = { Text(stringResource(R.string.label_remove_override_confirm_message, base.name)) },
            confirmButton = {
                TextButton(onClick = {
                    removeOverrideTarget = null
                    onRemoveOverride(base.id)
                }) {
                    Text(
                        stringResource(R.string.action_remove_override),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { removeOverrideTarget = null }) {
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

// MARK: - Base Progress Row

@Composable
private fun BaseProgressRow(
    base: Base,
    progress: TeamBaseProgressResponse?,
    override: BaseUnlockOverrideResponse?,
    onMarkCompleted: () -> Unit,
    onManualCheckIn: () -> Unit,
    onGrantOverride: () -> Unit,
    onRemoveOverride: () -> Unit,
) {
    val statusLabel = when (progress?.status) {
        BaseStatus.COMPLETED -> stringResource(R.string.label_base_status_completed)
        BaseStatus.CHECKED_IN -> stringResource(R.string.label_base_status_checked_in)
        BaseStatus.SUBMITTED -> stringResource(R.string.label_base_status_submitted)
        BaseStatus.REJECTED -> stringResource(R.string.label_base_status_rejected)
        else -> stringResource(R.string.label_base_status_not_visited)
    }
    val statusColor = when (progress?.status) {
        BaseStatus.COMPLETED -> Color(BaseStatus.COLOR_COMPLETED)
        BaseStatus.CHECKED_IN -> Color(BaseStatus.COLOR_CHECKED_IN)
        BaseStatus.SUBMITTED -> Color(BaseStatus.COLOR_SUBMITTED)
        BaseStatus.REJECTED -> Color(BaseStatus.COLOR_REJECTED)
        else -> Color(BaseStatus.COLOR_NOT_VISITED)
    }
    val isCompleted = progress?.status == BaseStatus.COMPLETED
    val isCheckedIn = progress?.status == BaseStatus.CHECKED_IN
    val isPendingSubmission = progress?.status == BaseStatus.SUBMITTED

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (base.hidden) {
                        Text(
                            text = stringResource(R.string.label_hidden_base_icon),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(4.dp))
                    }
                    Text(
                        text = base.name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Text(
                    text = statusLabel,
                    style = MaterialTheme.typography.bodySmall,
                    color = statusColor,
                )
            }
            if (override != null) {
                val overrideLabel = buildOverrideLabel(override)
                Text(
                    text = overrideLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier
                        .background(
                            MaterialTheme.colorScheme.primaryContainer,
                            shape = MaterialTheme.shapes.small,
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }

        Spacer(Modifier.height(6.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Manual Check-In: shown when not yet checked in and not completed/pending
            if (!isCompleted && !isCheckedIn && !isPendingSubmission) {
                Button(
                    onClick = onManualCheckIn,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AmberAction.copy(alpha = 0.15f),
                        contentColor = AmberAction,
                    ),
                    modifier = Modifier
                        .height(36.dp)
                        .testTag("manual-check-in-btn-${base.id}"),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                ) {
                    Text(
                        text = stringResource(R.string.action_manual_check_in),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            // Mark Completed: hidden if already completed or submission is pending review
            if (!isCompleted && !isPendingSubmission) {
                Button(
                    onClick = onMarkCompleted,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AmberAction.copy(alpha = 0.15f),
                        contentColor = AmberAction,
                    ),
                    modifier = Modifier
                        .height(36.dp)
                        .testTag("mark-completed-btn-${base.id}"),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                ) {
                    Text(
                        text = stringResource(R.string.action_mark_completed),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                    )
                }
            } else if (isPendingSubmission) {
                Text(
                    text = stringResource(R.string.label_pending_review_hint),
                    style = MaterialTheme.typography.labelSmall,
                    color = Color(BaseStatus.COLOR_SUBMITTED),
                )
            }

            if (base.hidden) {
                if (override == null) {
                    Button(
                        onClick = onGrantOverride,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        ),
                        modifier = Modifier
                            .height(36.dp)
                            .testTag("grant-override-btn-${base.id}"),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.action_grant_override),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                } else {
                    Button(
                        onClick = onRemoveOverride,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                            contentColor = MaterialTheme.colorScheme.onErrorContainer,
                        ),
                        modifier = Modifier
                            .height(36.dp)
                            .testTag("remove-override-btn-${base.id}"),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 0.dp),
                    ) {
                        Text(
                            text = stringResource(R.string.action_remove_override),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
    }
}

/** Format override badge label with operator name + time (HH:mm). */
@Composable
private fun buildOverrideLabel(override: BaseUnlockOverrideResponse): String {
    val name = override.createdByDisplayName ?: "?"
    val time = runCatching {
        val parser = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US).also {
            it.timeZone = java.util.TimeZone.getDefault()
        }
        val date = parser.parse(override.createdAt.take(19)) ?: return@runCatching ""
        java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(date)
    }.getOrDefault("")
    return if (time.isNotEmpty()) "$name · $time" else name
}

// MARK: - Manual Check-In Dialog

@Composable
private fun ManualCheckInDialog(
    baseName: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var reason by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.label_manual_check_in_dialog_title)) },
        text = {
            Column {
                Text(
                    text = baseName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.label_manual_check_in_dialog_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= REASON_MAX_LENGTH) reason = it },
                    label = { Text(stringResource(R.string.label_manual_check_in_reason)) },
                    placeholder = { Text(stringResource(R.string.label_manual_check_in_reason_placeholder)) },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "${reason.length}/$REASON_MAX_LENGTH",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.End),
                )
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else {
                TextButton(
                    onClick = {
                        isSubmitting = true
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onConfirm()
                    },
                ) {
                    Text(
                        text = stringResource(R.string.action_manual_check_in),
                        color = AmberAction,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

// MARK: - Mark Completed Dialog

@Composable
private fun MarkCompletedDialog(
    baseName: String,
    challengeId: String?,
    onConfirm: (reason: String?, pointsOverride: Int?) -> Unit,
    onDismiss: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var reason by remember { mutableStateOf("") }
    var pointsText by remember { mutableStateOf("") }
    var pointsError by remember { mutableStateOf(false) }
    var isSubmitting by remember { mutableStateOf(false) }
    val noChallengeAssigned = challengeId == null

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.label_mark_completed_dialog_title)) },
        text = {
            Column {
                Text(
                    text = baseName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.label_mark_completed_dialog_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= REASON_MAX_LENGTH) reason = it },
                    label = { Text(stringResource(R.string.label_mark_completed_reason)) },
                    placeholder = { Text(stringResource(R.string.label_mark_completed_reason_placeholder)) },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "${reason.length}/$REASON_MAX_LENGTH",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.End),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = pointsText,
                    onValueChange = { newValue ->
                        // Accept only valid integer strings (including leading minus sign)
                        if (newValue.isEmpty() || Regex("^-?\\d*$").matches(newValue)) {
                            pointsText = newValue
                            pointsError = false
                        } else {
                            pointsError = true
                        }
                    },
                    label = { Text(stringResource(R.string.label_mark_completed_points)) },
                    placeholder = { Text(stringResource(R.string.label_mark_completed_points_placeholder)) },
                    singleLine = true,
                    isError = pointsError,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.label_mark_completed_helper),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (noChallengeAssigned) {
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.label_no_challenge_for_base),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else {
                TextButton(
                    onClick = {
                        isSubmitting = true
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        val trimmedReason = reason.trim().ifEmpty { null }
                        val pts = pointsText.trim().toIntOrNull()
                        onConfirm(trimmedReason, pts)
                    },
                    enabled = !noChallengeAssigned && !pointsError,
                ) {
                    Text(
                        text = stringResource(R.string.action_mark_completed),
                        color = if (noChallengeAssigned) MaterialTheme.colorScheme.onSurfaceVariant else AmberAction,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

// MARK: - Grant Override Dialog

@Composable
private fun GrantOverrideDialog(
    baseName: String,
    onConfirm: (reason: String?) -> Unit,
    onDismiss: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    var reason by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.label_unlock_override_dialog_title)) },
        text = {
            Column {
                Text(
                    text = baseName,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.label_unlock_override_dialog_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = reason,
                    onValueChange = { if (it.length <= REASON_MAX_LENGTH) reason = it },
                    label = { Text(stringResource(R.string.label_unlock_override_reason)) },
                    placeholder = { Text(stringResource(R.string.label_unlock_override_reason_placeholder)) },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    text = "${reason.length}/$REASON_MAX_LENGTH",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.align(Alignment.End),
                )
            }
        },
        confirmButton = {
            if (isSubmitting) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp))
            } else {
                TextButton(
                    onClick = {
                        isSubmitting = true
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        val trimmedReason = reason.trim().ifEmpty { null }
                        onConfirm(trimmedReason)
                    },
                ) {
                    Text(
                        text = stringResource(R.string.action_grant_override),
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
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
