package com.prayer.pointfinder.feature.player

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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

    // Update style when tileSource or dark mode changes
    LaunchedEffect(map, tileSource, isDark) {
        map?.setStyle(Style.Builder().fromUri(TileSources.getResolvedStyleUrl(tileSource, isDark)))
    }

    val density = context.resources.displayMetrics.density

    // Update markers whenever progress changes
    LaunchedEffect(map, progress) {
        val m = map ?: return@LaunchedEffect
        m.annotations.forEach { m.removeAnnotation(it) }

        progress.forEach { item ->
            val colorInt = statusColorInt(item.status)
            val icon = iconFactory.fromBitmap(createPinMarkerBitmap(colorInt, item.status, density))
            m.addMarker(
                MarkerOptions()
                    .position(LatLng(item.lat, item.lng))
                    .title(item.baseName)
                    .snippet(item.status.name.lowercase())
                    .icon(icon),
            )
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
                            val item = progress.firstOrNull {
                                it.lat == marker.position.latitude && it.lng == marker.position.longitude
                            }
                            if (item != null) {
                                onBaseSelected(item)
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

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 12.dp, start = 16.dp, end = 16.dp)
                .background(Color.Black.copy(alpha = 0.55f), shape = MaterialTheme.shapes.small)
                .padding(horizontal = 12.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
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

private fun statusColorInt(status: BaseStatus): Int = when (status) {
    BaseStatus.NOT_VISITED -> android.graphics.Color.GRAY
    BaseStatus.CHECKED_IN -> android.graphics.Color.parseColor("#1565C0")
    BaseStatus.SUBMITTED -> android.graphics.Color.parseColor("#E08A00")
    BaseStatus.COMPLETED -> android.graphics.Color.parseColor("#2E7D32")
    BaseStatus.REJECTED -> android.graphics.Color.parseColor("#D32F2F")
}

private fun createPinMarkerBitmap(colorInt: Int, status: BaseStatus, density: Float): Bitmap {
    // Target: 36dp circle + 6dp triangle, matching iOS BaseAnnotationView
    val circleDiameterPx = (36 * density).toInt()
    val triangleHeightPx = (6 * density).toInt()
    val shadowPx = (4 * density).toInt()
    val width = circleDiameterPx + shadowPx * 2
    val height = circleDiameterPx + triangleHeightPx + shadowPx * 2
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val cx = width / 2f
    val radius = circleDiameterPx / 2f
    val cy = radius + shadowPx

    // Shadow
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = 100
        maskFilter = android.graphics.BlurMaskFilter(shadowPx.toFloat(), android.graphics.BlurMaskFilter.Blur.NORMAL)
    }
    canvas.drawCircle(cx, cy + shadowPx * 0.5f, radius, shadowPaint)

    // Main circle
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, radius, fillPaint)

    // Triangle pointer
    val triTop = cy + radius * 0.7f
    val triBottom = cy + radius + triangleHeightPx
    val triPath = android.graphics.Path().apply {
        moveTo(cx - radius * 0.35f, triTop)
        lineTo(cx, triBottom)
        lineTo(cx + radius * 0.35f, triTop)
        close()
    }
    canvas.drawPath(triPath, fillPaint)

    // White icon — draw using unicode text for clean rendering
    val iconChar = when (status) {
        BaseStatus.NOT_VISITED -> "\u25CB"   // ○ circle outline (mappin)
        BaseStatus.CHECKED_IN -> "\u2691"    // ⚑ flag
        BaseStatus.SUBMITTED -> "\u25F4"     // ◴ clock
        BaseStatus.COMPLETED -> "\u2713"     // ✓ checkmark
        BaseStatus.REJECTED -> "\u2717"      // ✗ xmark
    }
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        textSize = radius * 0.95f
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val textBounds = android.graphics.Rect()
    textPaint.getTextBounds(iconChar, 0, iconChar.length, textBounds)
    canvas.drawText(iconChar, cx, cy + textBounds.height() / 2f, textPaint)

    return bitmap
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
