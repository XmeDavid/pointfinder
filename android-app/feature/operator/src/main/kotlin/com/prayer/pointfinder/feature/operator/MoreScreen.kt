package com.prayer.pointfinder.feature.operator

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Button
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse

@Composable
fun MoreScreen(
    currentLanguage: String,
    currentThemeMode: String,
    notificationSettings: OperatorNotificationSettingsResponse?,
    isLoadingNotificationSettings: Boolean,
    isSavingNotificationSettings: Boolean,
    onLanguageChanged: (String) -> Unit,
    onThemeModeChanged: (String) -> Unit,
    onNotificationSettingsChanged: (Boolean, Boolean, Boolean) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToNotifications: () -> Unit,
    onNavigateToOperators: () -> Unit,
    onExportGame: () -> Unit,
    onSwitchGame: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val notifyPendingSubmissions = notificationSettings?.notifyPendingSubmissions ?: true
    val notifyAllSubmissions = notificationSettings?.notifyAllSubmissions ?: false
    val notifyCheckIns = notificationSettings?.notifyCheckIns ?: false

    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text(
                stringResource(R.string.label_more),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }

        // Game section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_game_section)) {
                NavigationRow(
                    icon = Icons.Default.Settings,
                    label = stringResource(R.string.label_game_settings),
                    onClick = onNavigateToSettings,
                )
                NavigationRow(
                    icon = Icons.Default.Notifications,
                    label = stringResource(R.string.label_send_notifications),
                    onClick = onNavigateToNotifications,
                )
                NavigationRow(
                    icon = Icons.Default.People,
                    label = stringResource(R.string.label_manage_operators),
                    onClick = onNavigateToOperators,
                )
            }
        }

        // Data section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_data_section)) {
                NavigationRow(
                    icon = Icons.Default.Download,
                    label = stringResource(R.string.label_export_game),
                    onClick = onExportGame,
                    modifier = Modifier.testTag("game-export-btn"),
                )
            }
        }

        // App Settings section
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_app_settings)) {
                // Language picker
                Text(
                    stringResource(R.string.label_language),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("en" to "English", "pt" to "Portugues", "de" to "Deutsch").forEach { (code, label) ->
                        val isSelected = code == currentLanguage
                        if (isSelected) {
                            Button(onClick = {}) { Text(label) }
                        } else {
                            TextButton(onClick = { onLanguageChanged(code) }) { Text(label) }
                        }
                    }
                }

                Spacer(Modifier.height(4.dp))

                // Theme picker
                Text(
                    stringResource(R.string.label_theme),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "SYSTEM" to stringResource(R.string.label_theme_system),
                        "LIGHT" to stringResource(R.string.label_theme_light),
                        "DARK" to stringResource(R.string.label_theme_dark),
                    ).forEach { (mode, label) ->
                        val isSelected = mode == currentThemeMode
                        if (isSelected) {
                            Button(onClick = {}) { Text(label) }
                        } else {
                            TextButton(onClick = { onThemeModeChanged(mode) }) { Text(label) }
                        }
                    }
                }
            }
        }

        // Notification settings
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_notification_settings)) {
                if (isLoadingNotificationSettings && notificationSettings == null) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_pending_submissions),
                        checked = notifyPendingSubmissions,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(enabled, notifyAllSubmissions, notifyCheckIns)
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_all_submissions),
                        checked = notifyAllSubmissions,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(notifyPendingSubmissions, enabled, notifyCheckIns)
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_check_ins),
                        checked = notifyCheckIns,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(notifyPendingSubmissions, notifyAllSubmissions, enabled)
                    }
                    if (isSavingNotificationSettings) {
                        Text(
                            text = stringResource(R.string.common_saving),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }

        // Privacy
        item {
            OperatorSettingsSection(title = stringResource(R.string.label_privacy)) {
                TextButton(
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
                    },
                ) {
                    Text(stringResource(R.string.action_open_privacy_policy))
                }
            }
        }

        // Switch Game / Logout
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedButton(
                    onClick = onSwitchGame,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(stringResource(R.string.action_switch_game))
                }
                TextButton(
                    onClick = onLogout,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error,
                    ),
                ) {
                    Text(stringResource(R.string.action_logout))
                }
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun NavigationRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                icon,
                contentDescription = null,
                modifier = Modifier.size(22.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(label, style = MaterialTheme.typography.bodyLarge)
        }
        Icon(
            Icons.Default.ChevronRight,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
