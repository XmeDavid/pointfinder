package com.prayer.pointfinder.feature.operator

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.BaseStatus
import com.prayer.pointfinder.core.model.Team
import com.prayer.pointfinder.core.model.TeamBaseProgressResponse
import com.prayer.pointfinder.core.model.TeamLocationResponse
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.CameraPositionState
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun OperatorMapScreen(
    bases: List<Base>,
    teamLocations: List<TeamLocationResponse>,
    teams: List<Team>,
    baseProgress: List<TeamBaseProgressResponse>,
    cameraPositionState: CameraPositionState,
    onBaseSelected: (Base) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(bases) {
        if (bases.isNotEmpty() && !cameraPositionState.isMoving) {
            val builder = LatLngBounds.builder()
            bases.forEach { builder.include(LatLng(it.lat, it.lng)) }
            runCatching {
                cameraPositionState.animate(CameraUpdateFactory.newLatLngBounds(builder.build(), 80))
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        GoogleMap(modifier = Modifier.fillMaxSize(), cameraPositionState = cameraPositionState) {
            bases.forEach { base ->
                val aggregateStatus = aggregateBaseStatus(base, baseProgress)
                val markerIcon = statusToMarkerIcon(aggregateStatus)
                Marker(
                    state = MarkerState(LatLng(base.lat, base.lng)),
                    title = base.name,
                    snippet = stringResource(R.string.label_base_marker),
                    icon = markerIcon,
                    onClick = {
                        onBaseSelected(base)
                        true
                    },
                )
            }
            teamLocations.forEach { location ->
                val team = teams.firstOrNull { it.id == location.teamId }
                val playerName = location.displayName ?: team?.name ?: location.teamId.take(6)
                val teamName = team?.name ?: location.teamId.take(6)
                val teamColorInt = team?.color?.let { c ->
                    runCatching { android.graphics.Color.parseColor(c) }.getOrDefault(android.graphics.Color.GRAY)
                } ?: android.graphics.Color.GRAY
                Marker(
                    state = MarkerState(LatLng(location.lat, location.lng)),
                    title = "$playerName ($teamName)",
                    snippet = formatTimestamp(location.updatedAt),
                    icon = createCircleMarkerBitmap(teamColorInt),
                )
            }
        }
        Button(
            onClick = onRefresh,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(12.dp),
        ) {
            Text(stringResource(R.string.action_refresh))
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

private fun statusToMarkerIcon(status: BaseStatus): BitmapDescriptor {
    val colorInt = when (status) {
        BaseStatus.NOT_VISITED -> android.graphics.Color.GRAY
        BaseStatus.CHECKED_IN -> android.graphics.Color.parseColor("#1976D2")
        BaseStatus.SUBMITTED -> android.graphics.Color.parseColor("#F57C00")
        BaseStatus.COMPLETED -> android.graphics.Color.parseColor("#388E3C")
        BaseStatus.REJECTED -> android.graphics.Color.parseColor("#D32F2F")
    }
    return createPinMarkerBitmap(colorInt)
}

private val pinBitmapCache = mutableMapOf<Int, BitmapDescriptor>()

private fun createPinMarkerBitmap(colorInt: Int, width: Int = 48, height: Int = 64): BitmapDescriptor {
    pinBitmapCache[colorInt]?.let { return it }
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        style = Paint.Style.FILL
    }
    val circleRadius = width / 2f - 2f
    val circleCenterY = circleRadius + 2f
    canvas.drawCircle(width / 2f, circleCenterY, circleRadius, paint)
    val path = android.graphics.Path().apply {
        moveTo(width / 2f - circleRadius * 0.6f, circleCenterY + circleRadius * 0.7f)
        lineTo(width / 2f, height.toFloat() - 2f)
        lineTo(width / 2f + circleRadius * 0.6f, circleCenterY + circleRadius * 0.7f)
        close()
    }
    canvas.drawPath(path, paint)
    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.FILL
    }
    canvas.drawCircle(width / 2f, circleCenterY, circleRadius * 0.35f, dotPaint)
    return BitmapDescriptorFactory.fromBitmap(bitmap).also { pinBitmapCache[colorInt] = it }
}

private val circleBitmapCache = mutableMapOf<Int, BitmapDescriptor>()

private fun createCircleMarkerBitmap(colorInt: Int, sizePx: Int = 48): BitmapDescriptor {
    circleBitmapCache[colorInt]?.let { return it }
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
    return BitmapDescriptorFactory.fromBitmap(bitmap).also { circleBitmapCache[colorInt] = it }
}

internal fun formatTimestamp(iso: String): String {
    return runCatching {
        val instant = Instant.parse(iso)
        val local = instant.atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofPattern("HH:mm").format(local)
    }.getOrDefault(iso)
}
