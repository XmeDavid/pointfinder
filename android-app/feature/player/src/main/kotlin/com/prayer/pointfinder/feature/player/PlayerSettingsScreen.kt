package com.prayer.pointfinder.feature.player

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.GameStatus

@Composable
fun PlayerSettingsScreen(
    gameName: String?,
    gameStatus: GameStatus?,
    teamName: String?,
    teamColor: String?,
    displayName: String?,
    deviceId: String,
    pendingActionsCount: Int,
    progress: List<BaseProgress>,
    currentLanguage: String,
    onLanguageChanged: (String) -> Unit,
    currentThemeMode: String,
    onThemeModeChanged: (String) -> Unit,
    isDeletingAccount: Boolean,
    onDeleteAccount: () -> Unit,
    onLogout: () -> Unit,
    errorMessage: String? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var showDeleteDialog by remember { mutableStateOf(false) }
    val completedCount = progress.count { it.status == BaseStatus.COMPLETED }
    val checkedInCount = progress.count { it.status == BaseStatus.CHECKED_IN }
    val pendingReviewCount = progress.count { it.status == BaseStatus.SUBMITTED }
    val teamDotColor = parseTeamColor(teamColor)

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(
                stringResource(R.string.label_settings),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }

        // Language (first, matching iOS)
        item {
            SettingsSection(title = stringResource(R.string.label_language)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("en" to "English", "pt" to "Portugues", "de" to "Deutsch").forEach { (code, label) ->
                        val isSelected = code == currentLanguage
                        if (isSelected) {
                            Button(onClick = {}) {
                                Text(label)
                            }
                        } else {
                            TextButton(onClick = { onLanguageChanged(code) }) {
                                Text(label)
                            }
                        }
                    }
                }
            }
        }

        // Theme
        item {
            SettingsSection(title = stringResource(R.string.label_theme)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "SYSTEM" to stringResource(R.string.label_theme_system),
                        "LIGHT" to stringResource(R.string.label_theme_light),
                        "DARK" to stringResource(R.string.label_theme_dark),
                    ).forEach { (mode, label) ->
                        val isSelected = mode == currentThemeMode
                        if (isSelected) {
                            Button(onClick = {}) {
                                Text(label)
                            }
                        } else {
                            TextButton(onClick = { onThemeModeChanged(mode) }) {
                                Text(label)
                            }
                        }
                    }
                }
            }
        }

        // Current game
        item {
            SettingsSection(title = stringResource(R.string.label_current_game)) {
                SettingValueRow(label = stringResource(R.string.label_game), value = gameName ?: "-")
                SettingValueRow(label = stringResource(R.string.label_status), value = gameStatus?.name?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "-")
            }
        }

        // Team
        item {
            SettingsSection(title = stringResource(R.string.label_your_team)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_team))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .clip(CircleShape)
                                .background(teamDotColor),
                        )
                        Text(teamName ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }

        // Profile
        item {
            SettingsSection(title = stringResource(R.string.label_your_profile)) {
                SettingValueRow(label = stringResource(R.string.label_name), value = displayName ?: "-")
            }
        }

        // Progress
        item {
            SettingsSection(title = stringResource(R.string.label_progress)) {
                SettingValueRow(label = stringResource(R.string.label_total_bases), value = progress.size.toString())
                SettingValueRow(label = stringResource(R.string.status_completed), value = completedCount.toString(), valueColor = StatusCompleted)
                SettingValueRow(label = stringResource(R.string.status_checked_in), value = checkedInCount.toString(), valueColor = StatusCheckedIn)
                SettingValueRow(label = stringResource(R.string.status_submitted), value = pendingReviewCount.toString(), valueColor = StatusSubmitted)
            }
        }

        // Device + pending
        item {
            SettingsSection(title = stringResource(R.string.label_device)) {
                SettingValueRow(label = stringResource(R.string.label_device_id), value = stringResource(R.string.label_device_id_short, deviceId.take(8)))
                SettingValueRow(label = stringResource(R.string.label_pending_actions), value = pendingActionsCount.toString())
            }
        }

        // Privacy
        item {
            SettingsSection(title = stringResource(R.string.label_privacy)) {
                TextButton(
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
                    },
                ) {
                    Text(stringResource(R.string.action_open_privacy_policy))
                }
            }
        }

        // Error display
        if (!errorMessage.isNullOrBlank()) {
            item {
                Text(
                    errorMessage,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }

        // Account actions
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.action_leave_game))
                }
                TextButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isDeletingAccount,
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(
                        if (isDeletingAccount) {
                            stringResource(R.string.label_deleting_account)
                        } else {
                            stringResource(R.string.action_delete_account)
                        },
                    )
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.dialog_delete_account_title)) },
            text = { Text(stringResource(R.string.dialog_delete_account_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        onDeleteAccount()
                    },
                ) {
                    Text(stringResource(R.string.dialog_delete_account_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(android.R.string.cancel))
                }
            },
        )
    }
}
