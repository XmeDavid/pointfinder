package com.prayer.pointfinder.feature.player

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.BaseProgress
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.CheckInResponse
import com.prayer.pointfinder.core.model.TileSources
import com.prayer.pointfinder.core.designsystem.PFColors
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

@Composable
fun PlayerMapScreen(
    progress: List<BaseProgress>,
    isLoading: Boolean,
    unseenNotificationCount: Long,
    tileSource: String,
    isDark: Boolean,
    onBaseSelected: (BaseProgress) -> Unit,
    onRefresh: () -> Unit,
    onNotificationsClick: () -> Unit,
    gameName: String? = null,
    gameStatus: String? = null,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapView = remember { MapView(context) }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    val iconFactory = remember { IconFactory.getInstance(context) }

    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> {}
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }

    // Keep references fresh for the factory-captured click handler
    val currentProgress by rememberUpdatedState(progress)
    val currentOnBaseSelected by rememberUpdatedState(onBaseSelected)

    // Update style when tileSource or dark mode changes
    LaunchedEffect(map, tileSource, isDark) {
        map?.setStyle(Style.Builder().fromUri(TileSources.getResolvedStyleUrl(tileSource, isDark)))
    }

    val density = context.resources.displayMetrics.density

    // P1 Phase 4 W4: map markers display the challenge title (what
    // the player is looking to solve), not the operator-oriented base
    // name. Bases with no assigned challenge fall back to a localized
    // placeholder. We capture the placeholder once here so the
    // LaunchedEffect lambda below stays compose-free.
    val defaultMapLabel = stringResource(R.string.base_default_name)

    // Update markers whenever progress changes (incremental: remove only changed markers, add new ones)
    LaunchedEffect(map, progress, isDark) {
        val m = map ?: return@LaunchedEffect
        val currentMarkers = m.annotations.filterIsInstance<org.maplibre.android.annotations.Marker>()
        val progressIds = progress.map { it.baseId }.toSet()

        // Remove markers for bases no longer in progress
        currentMarkers.forEach { marker ->
            if (marker.snippet !in progressIds) {
                m.removeAnnotation(marker)
            }
        }

        // Update or add markers
        progress.forEach { item ->
            val label = item.challengeTitle?.takeIf { it.isNotBlank() } ?: defaultMapLabel
            val existingMarker = currentMarkers.firstOrNull { it.snippet == item.baseId }
            if (existingMarker != null) {
                // Update existing marker icon/position in case status changed
                val icon = iconFactory.fromBitmap(createPinMarkerBitmap(statusColorInt(item.status, isDark), item.status, density))
                existingMarker.icon = icon
                existingMarker.position = LatLng(item.lat, item.lng)
                existingMarker.title = label
            } else {
                // New marker
                addMarkerForProgress(m, item, label, iconFactory, density, isDark)
            }
        }

        if (progress.isNotEmpty()) {
            val boundsBuilder = LatLngBounds.Builder()
            progress.forEach { boundsBuilder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                m.easeCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize().testTag("player-base-list")) {
        AndroidView(
            factory = {
                mapView.apply {
                    getMapAsync { mapLibreMap ->
                        // Style is set by LaunchedEffect(map, tileSource, isDark) — not here
                        // Push compass below the overlay buttons (12dp padding + ~48dp button height)
                        val compassMarginTop = (64 * context.resources.displayMetrics.density).toInt()
                        mapLibreMap.uiSettings.setCompassMargins(0, compassMarginTop, (12 * context.resources.displayMetrics.density).toInt(), 0)
                        mapLibreMap.setOnMarkerClickListener { marker ->
                            val baseId = marker.snippet
                            val item = currentProgress.firstOrNull { it.baseId == baseId }
                            if (item != null) {
                                currentOnBaseSelected(item)
                                true
                            } else {
                                false
                            }
                        }
                        map = mapLibreMap
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        PlayerMapHeader(
            title = gameName ?: stringResource(R.string.label_map),
            liveLabel = if (gameStatus == "live") stringResource(R.string.label_live) else null,
            unseenNotificationCount = unseenNotificationCount,
            isLoading = isLoading,
            notificationsLabel = stringResource(R.string.label_notifications),
            refreshLabel = stringResource(R.string.action_refresh),
            onNotificationsClick = onNotificationsClick,
            onRefresh = onRefresh,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        )

        // Map legend at bottom
        PlayerMapLegend(
            items = listOf(
                PlayerMapLegendItem(stringResource(R.string.status_not_visited), PlayerFieldTone.UNKNOWN),
                PlayerMapLegendItem(stringResource(R.string.status_checked_in), PlayerFieldTone.INFO),
                PlayerMapLegendItem(stringResource(R.string.status_submitted), PlayerFieldTone.PENDING),
                PlayerMapLegendItem(stringResource(R.string.status_completed), PlayerFieldTone.SUCCESS),
                PlayerMapLegendItem(stringResource(R.string.status_rejected), PlayerFieldTone.DANGER),
            ),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(bottom = 12.dp, start = 16.dp, end = 16.dp),
        )
    }
}

private fun addMarkerForProgress(
    map: MapLibreMap,
    item: BaseProgress,
    label: String,
    iconFactory: IconFactory,
    density: Float,
    isDark: Boolean,
) {
    val colorInt = statusColorInt(item.status, isDark)
    val icon = iconFactory.fromBitmap(createPinMarkerBitmap(colorInt, item.status, density))
    map.addMarker(
        MarkerOptions()
            .position(LatLng(item.lat, item.lng))
            .title(label)
            .snippet(item.baseId)
            .icon(icon),
    )
}

private fun statusColorInt(status: BaseStatus, isDark: Boolean): Int = when (status) {
    BaseStatus.NOT_VISITED -> if (isDark) PFColors.StatusUnknownDark.toArgb() else PFColors.StatusUnknownLight.toArgb()
    BaseStatus.CHECKED_IN -> if (isDark) PFColors.StatusCheckedInDark.toArgb() else PFColors.StatusCheckedInLight.toArgb()
    BaseStatus.SUBMITTED -> if (isDark) PFColors.StatusPendingDark.toArgb() else PFColors.StatusPendingLight.toArgb()
    BaseStatus.COMPLETED -> if (isDark) PFColors.StatusCompletedDark.toArgb() else PFColors.StatusCompletedLight.toArgb()
    BaseStatus.REJECTED -> if (isDark) PFColors.StatusRejectedDark.toArgb() else PFColors.StatusRejectedLight.toArgb()
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
    val statusTone = when (status) {
        BaseStatus.NOT_VISITED -> PlayerFieldTone.UNKNOWN
        BaseStatus.CHECKED_IN -> PlayerFieldTone.INFO
        BaseStatus.SUBMITTED -> PlayerFieldTone.PENDING
        BaseStatus.COMPLETED -> PlayerFieldTone.SUCCESS
        BaseStatus.REJECTED -> PlayerFieldTone.DANGER
    }
    val statusIcon = when (status) {
        BaseStatus.NOT_VISITED -> Icons.Default.LocationOn
        BaseStatus.CHECKED_IN -> Icons.Default.CheckCircle
        BaseStatus.SUBMITTED -> Icons.Default.CheckCircle
        BaseStatus.COMPLETED -> Icons.Default.CheckCircle
        BaseStatus.REJECTED -> Icons.Default.LocationOn
    }

    // P1 Phase 4 W4: the sheet title is the challenge the player is
    // about to (or just did) solve, not the operator base name. Falls
    // back to a localized placeholder when the base has no assigned
    // challenge for the team (e.g. a hidden unlock-only base).
    val sheetTitle = baseProgress.challengeTitle?.takeIf { it.isNotBlank() }
        ?: stringResource(R.string.base_default_name)

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(sheetTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))

            PlayerFieldStatusBanner(
                title = baseStatusLabel(status),
                icon = statusIcon,
                tone = statusTone,
            )

            Spacer(Modifier.height(12.dp))

            if (status == BaseStatus.NOT_VISITED) {
                PlayerDetailMessage(
                    icon = Icons.Default.Lock,
                    title = stringResource(R.string.label_challenge_locked),
                    message = stringResource(R.string.label_challenge_locked_hint),
                )
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
            if (challenge?.requirePresenceToSubmit == true && (status == BaseStatus.CHECKED_IN || status == BaseStatus.REJECTED)) {
                Spacer(Modifier.height(8.dp))
                PlayerFieldStatusBanner(
                    title = stringResource(R.string.label_presence_warning_title),
                    message = stringResource(R.string.label_presence_warning_body),
                    icon = Icons.Default.LocationOn,
                    tone = PlayerFieldTone.PENDING,
                )
            }
            Spacer(Modifier.height(16.dp))

            when (status) {
                BaseStatus.NOT_VISITED -> {
                    // Check-in requires physical NFC tag scan — no direct check-in button
                }
                BaseStatus.CHECKED_IN, BaseStatus.REJECTED -> {
                    Button(
                        onClick = onSolve,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.action_solve_challenge)) }
                }
                BaseStatus.SUBMITTED -> {
                    PlayerFieldStatusBanner(
                        title = stringResource(R.string.label_awaiting_review),
                        icon = Icons.Default.CheckCircle,
                        tone = PlayerFieldTone.PENDING,
                    )
                }
                BaseStatus.COMPLETED -> {
                    PlayerFieldStatusBanner(
                        title = stringResource(R.string.status_completed),
                        icon = Icons.Default.CheckCircle,
                        tone = PlayerFieldTone.SUCCESS,
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}
