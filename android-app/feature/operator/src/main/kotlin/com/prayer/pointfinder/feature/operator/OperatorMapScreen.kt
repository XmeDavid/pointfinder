package com.prayer.pointfinder.feature.operator

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Assignment
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.GameStatus
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.prayer.pointfinder.core.model.TileSources
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.location.LocationComponentActivationOptions
import org.maplibre.android.location.modes.CameraMode
import org.maplibre.android.location.modes.RenderMode
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    teams: List<Team>,
    baseProgress: List<TeamBaseProgressResponse>,
    challenges: List<Challenge>,
    assignments: List<Assignment>,
    tileSource: String,
    isDark: Boolean,
    gameStatus: GameStatus,
    onBaseSelected: (Base) -> Unit,
    onCreateBaseAt: (lat: Double, lng: Double) -> Unit,
    onEditBase: (Base) -> Unit,
    onAddChallengeForBase: (Base) -> Unit,
    onWriteNfc: (Base) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapView = remember { MapView(context) }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var mapStyle by remember { mutableStateOf<Style?>(null) }
    val iconFactory = remember { IconFactory.getInstance(context) }

    var isEditMode by remember { mutableStateOf(gameStatus == GameStatus.SETUP) }
    var editSheetBase by remember { mutableStateOf<Base?>(null) }

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

    // Update style when tileSource changes, and enable location component
    LaunchedEffect(map, tileSource) {
        map?.setStyle(Style.Builder().fromUri(TileSources.getResolvedStyleUrl(tileSource, isDark))) { style ->
            mapStyle = style
            // Enable location component (blue dot)
            try {
                val hasPermission = ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION,
                ) == PackageManager.PERMISSION_GRANTED
                if (hasPermission) {
                    map?.locationComponent?.apply {
                        activateLocationComponent(
                            LocationComponentActivationOptions.builder(context, style).build(),
                        )
                        isLocationComponentEnabled = true
                        cameraMode = CameraMode.NONE
                        renderMode = RenderMode.NORMAL
                    }
                }
            } catch (_: Exception) {
                // Location component may not be available; skip blue dot
            }
        }
    }

    val density = context.resources.displayMetrics.density

    // Update markers and connection lines whenever data changes
    LaunchedEffect(map, mapStyle, bases, teamLocations, teams, baseProgress, challenges) {
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

        // Unlock connection lines and direction arrows
        mapStyle?.let { style ->
            style.getLayer("unlock-arrows")?.let { style.removeLayer(it) }
            style.getSource("unlock-arrows")?.let { style.removeSource(it) }
            style.getLayer("unlock-lines")?.let { style.removeLayer(it) }
            style.getSource("unlock-lines")?.let { style.removeSource(it) }

            val connections = challenges
                .filter { it.unlocksBaseId != null }
                .mapNotNull { challenge ->
                    val sourceBase = bases.find { it.fixedChallengeId == challenge.id }
                    val targetBase = bases.find { it.id == challenge.unlocksBaseId }
                    if (sourceBase != null && targetBase != null) Pair(sourceBase, targetBase) else null
                }

            if (connections.isNotEmpty()) {
                // Dashed connection lines
                val lineFeatures = connections.map { (from, to) ->
                    Feature.fromGeometry(
                        LineString.fromLngLats(
                            listOf(
                                Point.fromLngLat(from.lng, from.lat),
                                Point.fromLngLat(to.lng, to.lat),
                            ),
                        ),
                    )
                }
                style.addSource(GeoJsonSource("unlock-lines", FeatureCollection.fromFeatures(lineFeatures)))
                style.addLayer(
                    LineLayer("unlock-lines", "unlock-lines").withProperties(
                        PropertyFactory.lineColor("#6b7280"),
                        PropertyFactory.lineWidth(2f),
                        PropertyFactory.lineOpacity(0.5f),
                        PropertyFactory.lineDasharray(arrayOf(8f, 8f)),
                    ),
                )

                // Direction arrows at midpoint
                style.addImage("unlock-arrow", createArrowBitmap(density))
                val arrowFeatures = connections.map { (from, to) ->
                    val midLat = (from.lat + to.lat) / 2
                    val midLng = (from.lng + to.lng) / 2
                    val bearing = calculateBearing(from.lat, from.lng, to.lat, to.lng)
                    Feature.fromGeometry(Point.fromLngLat(midLng, midLat)).apply {
                        addNumberProperty("bearing", bearing)
                    }
                }
                style.addSource(GeoJsonSource("unlock-arrows", FeatureCollection.fromFeatures(arrowFeatures)))
                style.addLayer(
                    SymbolLayer("unlock-arrows", "unlock-arrows").withProperties(
                        PropertyFactory.iconImage("unlock-arrow"),
                        PropertyFactory.iconRotate(Expression.get("bearing")),
                        PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                        PropertyFactory.iconAllowOverlap(true),
                        PropertyFactory.iconOpacity(0.7f),
                    ),
                )
            }
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
                        // Push compass below the overlay buttons
                        val compassMarginTop = (56 * context.resources.displayMetrics.density).toInt()
                        mapLibreMap.uiSettings.setCompassMargins(0, compassMarginTop, (12 * context.resources.displayMetrics.density).toInt(), 0)
                        mapLibreMap.setOnMarkerClickListener { marker ->
                            val base = bases.firstOrNull {
                                it.lat == marker.position.latitude && it.lng == marker.position.longitude
                            }
                            if (base != null) {
                                if (isEditMode) {
                                    editSheetBase = base
                                } else {
                                    onBaseSelected(base)
                                }
                                true
                            } else {
                                false
                            }
                        }
                        mapLibreMap.addOnMapLongClickListener { point ->
                            if (isEditMode && gameStatus != GameStatus.ENDED) {
                                onCreateBaseAt(point.latitude, point.longitude)
                            }
                            true
                        }
                        map = mapLibreMap
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
        )

        // Top-right: Edit toggle chip + Refresh button
        if (gameStatus != GameStatus.ENDED) {
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(
                    selected = isEditMode,
                    onClick = { isEditMode = !isEditMode },
                    label = {
                        Text(
                            if (isEditMode) {
                                stringResource(R.string.label_edit_on)
                            } else {
                                stringResource(R.string.label_edit_off)
                            },
                        )
                    },
                    leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) },
                )
                SmallFloatingActionButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.action_refresh))
                }
            }
        } else {
            SmallFloatingActionButton(
                onClick = onRefresh,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(12.dp),
            ) {
                Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.action_refresh))
            }
        }

        // Bottom-left: Center on me button
        SmallFloatingActionButton(
            onClick = {
                try {
                    map?.locationComponent?.lastKnownLocation?.let { location ->
                        map?.animateCamera(
                            CameraUpdateFactory.newLatLngZoom(
                                LatLng(location.latitude, location.longitude),
                                15.0,
                            ),
                        )
                    }
                } catch (_: Exception) {
                    // Location component not available
                }
            },
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(12.dp),
        ) {
            Icon(Icons.Default.MyLocation, contentDescription = stringResource(R.string.label_center_on_me))
        }

        // Bottom-right: Add base at GPS FAB (only in edit mode)
        if (isEditMode && gameStatus != GameStatus.ENDED) {
            FloatingActionButton(
                onClick = {
                    try {
                        map?.locationComponent?.lastKnownLocation?.let { location ->
                            onCreateBaseAt(location.latitude, location.longitude)
                        }
                    } catch (_: Exception) {
                        // Location component not available
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(12.dp),
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.label_add_base_here))
            }
        }
    }

    // Edit mode bottom sheet for base actions
    if (editSheetBase != null) {
        val base = editSheetBase!!
        val challengeCount = assignments.count { it.baseId == base.id }
        BaseEditActionSheet(
            base = base,
            challengeCount = challengeCount,
            onEditBase = {
                editSheetBase = null
                onEditBase(base)
            },
            onAddChallenge = {
                editSheetBase = null
                onAddChallengeForBase(base)
            },
            onWriteNfc = {
                editSheetBase = null
                onWriteNfc(base)
            },
            onDismiss = { editSheetBase = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BaseEditActionSheet(
    base: Base,
    challengeCount: Int,
    onEditBase: () -> Unit,
    onAddChallenge: () -> Unit,
    onWriteNfc: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(base.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (base.description.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    base.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(8.dp))

            // Status badges
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val nfcColor = if (base.nfcLinked) StatusCompleted else StatusSubmitted
                val nfcLabel = if (base.nfcLinked) {
                    stringResource(R.string.label_nfc_linked)
                } else {
                    stringResource(R.string.label_nfc_not_linked)
                }
                CapsuleBadge(label = nfcLabel, color = nfcColor)
                CapsuleBadge(
                    label = stringResource(R.string.label_challenges_at_base, challengeCount),
                    color = BadgeIndigo,
                )
            }

            Spacer(Modifier.height(16.dp))

            // Action buttons
            Button(
                onClick = onEditBase,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Edit, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.label_edit_base))
            }

            Spacer(Modifier.height(8.dp))

            Button(
                onClick = onAddChallenge,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.label_add_challenge))
            }

            Spacer(Modifier.height(8.dp))

            Button(
                onClick = onWriteNfc,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.Nfc, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(R.string.action_write_nfc))
            }

            Spacer(Modifier.height(16.dp))
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

private fun createArrowBitmap(density: Float): Bitmap {
    val size = (14 * density).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.parseColor("#6b7280")
        style = Paint.Style.FILL
    }
    // Triangle pointing up (north) — rotated by icon-rotate to match bearing
    val path = android.graphics.Path().apply {
        moveTo(size / 2f, 0f)
        lineTo(size.toFloat(), size.toFloat())
        lineTo(size / 2f, size * 0.6f)
        lineTo(0f, size.toFloat())
        close()
    }
    canvas.drawPath(path, paint)
    return bitmap
}

private fun calculateBearing(lat1: Double, lng1: Double, lat2: Double, lng2: Double): Double {
    val dLng = Math.toRadians(lng2 - lng1)
    val lat1Rad = Math.toRadians(lat1)
    val lat2Rad = Math.toRadians(lat2)
    val y = kotlin.math.sin(dLng) * kotlin.math.cos(lat2Rad)
    val x = kotlin.math.cos(lat1Rad) * kotlin.math.sin(lat2Rad) -
        kotlin.math.sin(lat1Rad) * kotlin.math.cos(lat2Rad) * kotlin.math.cos(dLng)
    return (Math.toDegrees(kotlin.math.atan2(y, x)) + 360) % 360
}

internal fun formatTimestamp(iso: String): String {
    return runCatching {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm").format(local)
    }.getOrDefault(iso)
}
