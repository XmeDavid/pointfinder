package com.prayer.pointfinder.feature.operator

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse

@Composable
fun OperatorSettingsScreen(
    gameName: String?,
    gameStatus: GameStatus?,
    currentLanguage: String,
    notificationSettings: OperatorNotificationSettingsResponse?,
    isLoadingNotificationSettings: Boolean,
    isSavingNotificationSettings: Boolean,
    onLanguageChanged: (String) -> Unit,
    onNotificationSettingsChanged: (notifyPendingSubmissions: Boolean, notifyAllSubmissions: Boolean, notifyCheckIns: Boolean) -> Unit,
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
                stringResource(R.string.label_settings),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
        }

        item {
            OperatorSettingsSection(title = stringResource(R.string.label_language)) {
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
            }
        }

        item {
            OperatorSettingsSection(title = stringResource(R.string.label_current_game)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_game))
                    Text(gameName ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.label_status))
                    Text(
                        gameStatus?.name?.lowercase()?.replaceFirstChar { it.uppercase() } ?: "-",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

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
                        onNotificationSettingsChanged(
                            enabled,
                            notifyAllSubmissions,
                            notifyCheckIns,
                        )
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_all_submissions),
                        checked = notifyAllSubmissions,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(
                            notifyPendingSubmissions,
                            enabled,
                            notifyCheckIns,
                        )
                    }
                    SettingToggleRow(
                        label = stringResource(R.string.label_notify_check_ins),
                        checked = notifyCheckIns,
                        enabled = !isSavingNotificationSettings,
                    ) { enabled ->
                        onNotificationSettingsChanged(
                            notifyPendingSubmissions,
                            notifyAllSubmissions,
                            enabled,
                        )
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
private fun SettingToggleRow(
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            enabled = enabled,
        )
    }
}

@Composable
private fun OperatorSettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                shape = MaterialTheme.shapes.medium,
            )
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        content()
    }
}
