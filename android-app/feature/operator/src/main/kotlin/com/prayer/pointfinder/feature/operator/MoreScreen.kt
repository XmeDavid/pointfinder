package com.prayer.pointfinder.feature.operator

import android.content.Intent
import android.net.Uri
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tag
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.OperatorNotificationSettingsResponse
import com.prayer.pointfinder.core.model.PRIVACY_POLICY_URL

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
    onNavigateToBases: () -> Unit,
    onNavigateToChallenges: () -> Unit,
    onNavigateToTeams: () -> Unit,
    onNavigateToOperators: () -> Unit,
    onNavigateToTags: () -> Unit = {},
    onNavigateToAssignments: () -> Unit = {},
    onNavigateToActivity: () -> Unit = {},
    onNavigateToStages: () -> Unit = {},
    onNavigateToOrganization: (() -> Unit)? = null,
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
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
        // top + bottom breathing room
    ) {
        item { Spacer(Modifier.height(4.dp)) }

        // ── GAME section ──────────────────────────────────────────────────────
        item {
            MoreSectionCard(title = stringResource(R.string.label_game).uppercase()) {
                MoreIconRow(
                    icon = Icons.Default.Settings,
                    label = stringResource(R.string.label_game_settings),
                    onClick = onNavigateToSettings,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Notifications,
                    label = stringResource(R.string.label_send_notifications),
                    onClick = onNavigateToNotifications,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.People,
                    label = stringResource(R.string.label_manage_operators),
                    onClick = onNavigateToOperators,
                )
                if (onNavigateToOrganization != null) {
                    MoreSectionDivider()
                    MoreIconRow(
                        icon = Icons.Default.Business,
                        label = "Organization",
                        onClick = onNavigateToOrganization,
                    )
                }
            }
        }

        // ── MANAGEMENT section ────────────────────────────────────────────────
        item {
            MoreSectionCard(title = stringResource(R.string.label_manage).uppercase()) {
                MoreIconRow(
                    icon = Icons.Default.LocationOn,
                    label = stringResource(R.string.label_bases),
                    onClick = onNavigateToBases,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Star,
                    label = stringResource(R.string.label_challenges),
                    onClick = onNavigateToChallenges,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Group,
                    label = stringResource(R.string.label_teams),
                    onClick = onNavigateToTeams,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.FormatListNumbered,
                    label = stringResource(R.string.label_stages),
                    onClick = onNavigateToStages,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Link,
                    label = stringResource(R.string.label_assignments),
                    onClick = onNavigateToAssignments,
                    modifier = Modifier.testTag("nav-assignments-btn"),
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Star,
                    label = stringResource(R.string.label_activity_title),
                    onClick = onNavigateToActivity,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Tag,
                    label = stringResource(R.string.tags_manage),
                    onClick = onNavigateToTags,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.Download,
                    label = stringResource(R.string.label_export_game),
                    onClick = onExportGame,
                    modifier = Modifier.testTag("game-export-btn"),
                )
            }
        }

        // ── PREFERENCES section ───────────────────────────────────────────────
        item {
            MoreSectionCard(title = stringResource(R.string.label_app_settings).uppercase()) {
                // Language row with inline button group
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                        modifier = Modifier.size(32.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.MoreHoriz,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = stringResource(R.string.label_language),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf("en" to "EN", "pt" to "PT", "de" to "DE").forEach { (code, short) ->
                            val isSelected = code == currentLanguage
                            if (isSelected) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                ) {
                                    Text(
                                        text = short,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier.clickable { onLanguageChanged(code) },
                                ) {
                                    Text(
                                        text = short,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }
                    }
                }

                MoreSectionDivider()

                // Theme row with inline button group
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
                        modifier = Modifier.size(32.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                imageVector = Icons.Default.Settings,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = stringResource(R.string.label_theme),
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        listOf(
                            "SYSTEM" to stringResource(R.string.label_theme_system),
                            "LIGHT" to stringResource(R.string.label_theme_light),
                            "DARK" to stringResource(R.string.label_theme_dark),
                        ).forEach { (mode, label) ->
                            val isSelected = mode == currentThemeMode
                            if (isSelected) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.primary,
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onPrimary,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant,
                                    modifier = Modifier.clickable { onThemeModeChanged(mode) },
                                ) {
                                    Text(
                                        text = label,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // ── NOTIFICATIONS section ─────────────────────────────────────────────
        item {
            MoreSectionCard(title = stringResource(R.string.label_notification_settings).uppercase()) {
                if (isLoadingNotificationSettings && notificationSettings == null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp))
                    }
                } else {
                    MoreToggleRow(
                        icon = Icons.Default.Notifications,
                        label = stringResource(R.string.label_notify_pending_submissions),
                        checked = notifyPendingSubmissions,
                        enabled = !isSavingNotificationSettings,
                        onCheckedChange = { enabled ->
                            onNotificationSettingsChanged(enabled, notifyAllSubmissions, notifyCheckIns)
                        },
                    )
                    MoreSectionDivider()
                    MoreToggleRow(
                        icon = Icons.Default.Notifications,
                        label = stringResource(R.string.label_notify_all_submissions),
                        checked = notifyAllSubmissions,
                        enabled = !isSavingNotificationSettings,
                        onCheckedChange = { enabled ->
                            onNotificationSettingsChanged(notifyPendingSubmissions, enabled, notifyCheckIns)
                        },
                    )
                    MoreSectionDivider()
                    MoreToggleRow(
                        icon = Icons.Default.Notifications,
                        label = stringResource(R.string.label_notify_check_ins),
                        checked = notifyCheckIns,
                        enabled = !isSavingNotificationSettings,
                        onCheckedChange = { enabled ->
                            onNotificationSettingsChanged(notifyPendingSubmissions, notifyAllSubmissions, enabled)
                        },
                    )
                    if (isSavingNotificationSettings) {
                        Text(
                            text = stringResource(R.string.common_saving),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        )
                    }
                }
            }
        }

        // ── ACCOUNT section ───────────────────────────────────────────────────
        item {
            MoreSectionCard(title = stringResource(R.string.label_privacy).uppercase()) {
                MoreIconRow(
                    icon = Icons.Default.ArrowBack,
                    label = stringResource(R.string.action_open_privacy_policy),
                    onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_POLICY_URL)))
                    },
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.Default.ArrowBack,
                    label = stringResource(R.string.action_switch_game),
                    onClick = onSwitchGame,
                )
                MoreSectionDivider()
                MoreIconRow(
                    icon = Icons.AutoMirrored.Filled.ExitToApp,
                    label = stringResource(R.string.action_logout),
                    onClick = onLogout,
                    isDestructive = true,
                )
            }
        }

        item { Spacer(Modifier.height(16.dp)) }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section card
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun MoreSectionCard(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 1.dp,
            shadowElevation = 2.dp,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column {
                content()
            }
        }
    }
}

@Composable
private fun MoreSectionDivider() {
    Divider(
        modifier = Modifier.padding(start = 56.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun MoreIconRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    isDestructive: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val iconColor = if (isDestructive) StatusRejected else MaterialTheme.colorScheme.primary
    val iconBg = if (isDestructive) StatusRejected.copy(alpha = 0.1f) else MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)
    val labelColor = if (isDestructive) StatusRejected else MaterialTheme.colorScheme.onSurface

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = iconBg,
            modifier = Modifier.size(32.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.width(12.dp))

        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = labelColor,
            modifier = Modifier.weight(1f),
        )

        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(18.dp),
        )
    }
}

@Composable
private fun MoreToggleRow(
    icon: ImageVector,
    label: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.1f),
            modifier = Modifier.size(32.dp),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
            }
        }

        Spacer(Modifier.width(12.dp))

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
