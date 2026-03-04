package com.prayer.pointfinder.feature.operator

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.SmallFloatingActionButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.TileSources
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    teams: List<Team>,
    baseProgress: List<TeamBaseProgressResponse>,
    tileSource: String,
    isDark: Boolean,
    onBaseSelected: (Base) -> Unit,
    onRefresh: () -> Unit,
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

    // Update style when tileSource changes
    LaunchedEffect(map, tileSource) {
        map?.setStyle(Style.Builder().fromUri(TileSources.getResolvedStyleUrl(tileSource, isDark)))
    }

    val density = context.resources.displayMetrics.density

    // Update markers whenever data changes
    LaunchedEffect(map, bases, teamLocations, teams, baseProgress) {
        val m = map ?: return@LaunchedEffect
        m.annotations.forEach { m.removeAnnotation(it) }

        // Base markers
        bases.forEach { base ->
            val status = aggregateBaseStatus(base, baseProgress)
            val colorInt = statusColor(status)
            val icon = iconFactory.fromBitmap(createPinMarkerBitmap(colorInt, status, density, base.hidden))
            m.addMarker(
                MarkerOptions()
                    .position(LatLng(base.lat, base.lng))
                    .title(base.name)
                    .icon(icon),
            )
        }

        // Team location markers
        teamLocations.forEach { location ->
            val team = teams.firstOrNull { it.id == location.teamId }
            val playerName = location.displayName ?: team?.name ?: location.teamId.take(6)
            val teamName = team?.name ?: location.teamId.take(6)
            val teamColorInt = team?.color?.let { c ->
                runCatching { android.graphics.Color.parseColor(c) }.getOrDefault(android.graphics.Color.GRAY)
            } ?: android.graphics.Color.GRAY
            val icon = iconFactory.fromBitmap(createCircleMarkerBitmap(teamColorInt))
            m.addMarker(
                MarkerOptions()
                    .position(LatLng(location.lat, location.lng))
                    .title("$playerName ($teamName)")
                    .snippet(formatTimestamp(location.updatedAt))
                    .icon(icon),
            )
        }

        // Fit camera to bounds
        if (bases.isNotEmpty()) {
            val boundsBuilder = LatLngBounds.Builder()
            bases.forEach { boundsBuilder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                m.easeCamera(CameraUpdateFactory.newLatLngBounds(boundsBuilder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            factory = {
                mapView.apply {
                    getMapAsync { mapLibreMap ->
                        mapLibreMap.setStyle(Style.Builder().fromUri(TileSources.getResolvedStyleUrl(tileSource, isDark)))
                        // Push compass below the overlay button
                        val compassMarginTop = (56 * context.resources.displayMetrics.density).toInt()
                        mapLibreMap.uiSettings.setCompassMargins(0, compassMarginTop, (12 * context.resources.displayMetrics.density).toInt(), 0)
                        mapLibreMap.setOnMarkerClickListener { marker ->
                            val base = bases.firstOrNull {
                                it.lat == marker.position.latitude && it.lng == marker.position.longitude
                            }
                            if (base != null) {
                                onBaseSelected(base)
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
        SmallFloatingActionButton(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.action_refresh))
        }
    }
}

private fun aggregateBaseStatus(
    base: Base,
    baseProgress: List<TeamBaseProgressResponse>,
): BaseStatus {
    val statuses = baseProgress.filter { it.baseId == base.id }
    if (statuses.isEmpty()) return BaseStatus.NOT_VISITED
    return statuses.minByOrNull { it.status.ordinal }?.status ?: BaseStatus.NOT_VISITED
}

private fun statusColor(status: BaseStatus): Int = when (status) {
    BaseStatus.NOT_VISITED -> android.graphics.Color.GRAY
    BaseStatus.CHECKED_IN -> android.graphics.Color.parseColor("#1976D2")
    BaseStatus.SUBMITTED -> android.graphics.Color.parseColor("#F57C00")
    BaseStatus.COMPLETED -> android.graphics.Color.parseColor("#388E3C")
    BaseStatus.REJECTED -> android.graphics.Color.parseColor("#D32F2F")
}

private fun createPinMarkerBitmap(colorInt: Int, status: BaseStatus, density: Float, isHidden: Boolean = false): Bitmap {
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

    val effectiveAlpha = if (isHidden) 180 else 255 // ~70% for hidden

    // Shadow
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = if (isHidden) 70 else 100
        maskFilter = android.graphics.BlurMaskFilter(shadowPx.toFloat(), android.graphics.BlurMaskFilter.Blur.NORMAL)
    }
    canvas.drawCircle(cx, cy + shadowPx * 0.5f, radius, shadowPaint)

    // Main circle
    val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = effectiveAlpha
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

    // Dashed white border for hidden bases
    if (isHidden) {
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            alpha = effectiveAlpha
            style = Paint.Style.STROKE
            strokeWidth = 2f * density
            pathEffect = android.graphics.DashPathEffect(floatArrayOf(6f * density, 4f * density), 0f)
        }
        canvas.drawCircle(cx, cy, radius - density, borderPaint)
    }

    // White icon — use eye-slash for hidden bases
    val iconChar = if (isHidden) {
        "\u2298" // ⊘ circled-slash (eye-slash equivalent)
    } else {
        when (status) {
            BaseStatus.NOT_VISITED -> "\u25CB"   // ○ circle outline (mappin)
            BaseStatus.CHECKED_IN -> "\u2691"    // ⚑ flag
            BaseStatus.SUBMITTED -> "\u25F4"     // ◴ clock
            BaseStatus.COMPLETED -> "\u2713"     // ✓ checkmark
            BaseStatus.REJECTED -> "\u2717"      // ✗ xmark
        }
    }
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        alpha = effectiveAlpha
        textSize = radius * 0.95f
        textAlign = Paint.Align.CENTER
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val textBounds = android.graphics.Rect()
    textPaint.getTextBounds(iconChar, 0, iconChar.length, textBounds)
    canvas.drawText(iconChar, cx, cy + textBounds.height() / 2f, textPaint)

    return bitmap
}

private fun createCircleMarkerBitmap(colorInt: Int, sizePx: Int = 48): Bitmap {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, paint)
    val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    canvas.drawCircle(sizePx / 2f, sizePx / 2f, sizePx / 2f - 3f, border)
    return bitmap
}

internal fun formatTimestamp(iso: String): String {
    return runCatching {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm").format(local)
    }.getOrDefault(iso)
}
