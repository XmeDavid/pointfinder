package com.prayer.pointfinder.feature.player

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse

@Composable
fun PlayerMapScreen(
    progress: List<BaseProgress>,
    isLoading: Boolean,
    unseenNotificationCount: Long,
    cameraPositionState: CameraPositionState,
    onBaseSelected: (BaseProgress) -> Unit,
    onRefresh: () -> Unit,
    onNotificationsClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(progress) {
        if (progress.isNotEmpty() && !cameraPositionState.isMoving) {
            val builder = LatLngBounds.builder()
            progress.forEach { builder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
        ) {
            progress.forEach { item ->
                val markerHue = when (item.status) {
                    BaseStatus.NOT_VISITED -> BitmapDescriptorFactory.HUE_RED
                    BaseStatus.CHECKED_IN -> BitmapDescriptorFactory.HUE_AZURE
                    BaseStatus.SUBMITTED -> BitmapDescriptorFactory.HUE_ORANGE
                    BaseStatus.COMPLETED -> BitmapDescriptorFactory.HUE_GREEN
                    BaseStatus.REJECTED -> BitmapDescriptorFactory.HUE_ROSE
                }
                Marker(
                    state = MarkerState(position = LatLng(item.lat, item.lng)),
                    title = item.baseName,
                    snippet = item.status.name.lowercase(),
                    icon = BitmapDescriptorFactory.defaultMarker(markerHue),
                    onClick = {
                        onBaseSelected(item)
                        true
                    },
                )
            }
        }

        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp, start = 16.dp, end = 16.dp)
                .background(Color.Black.copy(alpha = 0.55f), shape = MaterialTheme.shapes.small)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            LegendDot(color = Color.Gray, label = stringResource(R.string.status_not_visited))
            LegendDot(color = StatusCheckedIn, label = stringResource(R.string.status_checked_in))
            LegendDot(color = StatusSubmitted, label = stringResource(R.string.status_submitted))
            LegendDot(color = StatusCompleted, label = stringResource(R.string.status_completed))
        }

        Row(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledTonalIconButton(onClick = onNotificationsClick) {
                BadgedBox(
                    badge = {
                        if (unseenNotificationCount > 0) {
                            val badgeLabel = if (unseenNotificationCount > 99) "99+" else unseenNotificationCount.toString()
                            Badge { Text(badgeLabel) }
                        }
                    },
                ) {
                    Icon(
                        imageVector = Icons.Default.Notifications,
                        contentDescription = stringResource(R.string.label_notifications),
                    )
                }
            }
            FilledTonalIconButton(onClick = onRefresh) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Icon(
                        imageVector = Icons.Default.Refresh,
                        contentDescription = stringResource(R.string.action_refresh),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BaseDetailBottomSheet(
    baseProgress: BaseProgress,
    challenge: CheckInResponse.ChallengeInfo?,
    onCheckIn: () -> Unit,
    onSolve: () -> Unit,
    onDismiss: () -> Unit,
) {
    val status = baseProgress.status
    val statusColor = when (status) {
        BaseStatus.NOT_VISITED -> Color.Gray
        BaseStatus.CHECKED_IN -> StatusCheckedIn
        BaseStatus.SUBMITTED -> StatusSubmitted
        BaseStatus.COMPLETED -> StatusCompleted
        BaseStatus.REJECTED -> StatusRejected
    }
    val statusIcon = when (status) {
        BaseStatus.NOT_VISITED -> Icons.Default.LocationOn
        BaseStatus.CHECKED_IN -> Icons.Default.CheckCircle
        BaseStatus.SUBMITTED -> Icons.Default.CheckCircle
        BaseStatus.COMPLETED -> Icons.Default.CheckCircle
        BaseStatus.REJECTED -> Icons.Default.LocationOn
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(baseProgress.baseName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))

            // Status banner
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(statusColor.copy(alpha = 0.12f), shape = MaterialTheme.shapes.medium)
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(statusIcon, contentDescription = null, tint = statusColor, modifier = Modifier.size(20.dp))
                    Text(baseStatusLabel(status), fontWeight = FontWeight.Medium, color = statusColor)
                }
                if (challenge != null && status != BaseStatus.NOT_VISITED) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Default.Star, contentDescription = null, tint = StarGold, modifier = Modifier.size(16.dp))
                        Text("${challenge.points} pts", style = MaterialTheme.typography.labelMedium, color = StarGold)
                    }
                }
            }

            Spacer(Modifier.height(12.dp))

            if (status == BaseStatus.NOT_VISITED) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Default.Lock,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                    Text(
                        stringResource(R.string.label_challenge_locked),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        stringResource(R.string.label_challenge_locked_hint),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                val detailHtml = when {
                    challenge == null -> null
                    status == BaseStatus.COMPLETED && !challenge.completionContent.isNullOrBlank() ->
                        challenge.completionContent
                    !challenge.content.isNullOrBlank() -> challenge.content
                    else -> null
                }
                Text(
                    challenge?.description ?: stringResource(R.string.label_no_challenge_details),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!detailHtml.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    HtmlContentView(html = detailHtml)
                }
            }
            Spacer(Modifier.height(16.dp))

            when (status) {
                BaseStatus.NOT_VISITED -> {
                    // No action button -- player must use the Check-In tab (NFC scan)
                }
                BaseStatus.CHECKED_IN, BaseStatus.REJECTED -> {
                    Button(
                        onClick = onSolve,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = StatusCheckedIn),
                    ) { Text(stringResource(R.string.action_solve_challenge)) }
                }
                BaseStatus.SUBMITTED -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(StatusSubmitted.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusSubmitted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.label_awaiting_review), color = StatusSubmitted, fontWeight = FontWeight.Medium)
                    }
                }
                BaseStatus.COMPLETED -> {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(StatusCompleted.copy(alpha = 0.12f), shape = MaterialTheme.shapes.small)
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = StatusCompleted, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.status_completed), color = StatusCompleted, fontWeight = FontWeight.Medium)
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
