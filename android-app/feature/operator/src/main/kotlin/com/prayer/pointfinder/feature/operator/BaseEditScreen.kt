package com.prayer.pointfinder.feature.operator

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.prayer.pointfinder.core.i18n.R
import com.prayer.pointfinder.core.model.Base
import com.prayer.pointfinder.core.model.Challenge
import com.prayer.pointfinder.core.model.CreateBaseRequest
import com.prayer.pointfinder.core.model.TileSources
import com.prayer.pointfinder.core.model.UpdateBaseRequest
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.Marker
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BaseEditScreen(
    base: Base?,
    challenges: List<Challenge>,
    linkedChallenges: List<Challenge>,
    onSave: (Any) -> Unit,
    onDelete: (() -> Unit)?,
    onWriteNfc: (() -> Unit)?,
    onNavigateToCreateChallenge: ((String) -> Unit)?,
    onBack: () -> Unit,
    initialLat: Double?,
    initialLng: Double?,
    modifier: Modifier = Modifier,
) {
    val isEditMode = base != null
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val density = context.resources.displayMetrics.density

    // Form state
    var name by remember { mutableStateOf(base?.name ?: "") }
    var description by remember { mutableStateOf(base?.description ?: "") }
    var requirePresence by remember { mutableStateOf(base?.requirePresenceToSubmit ?: false) }
    var hidden by remember { mutableStateOf(base?.hidden ?: false) }
    var fixedChallengeId by remember { mutableStateOf<String?>(base?.fixedChallengeId) }

    // Map pin state
    var pinLat by remember { mutableDoubleStateOf(base?.lat ?: initialLat ?: 0.0) }
    var pinLng by remember { mutableDoubleStateOf(base?.lng ?: initialLng ?: 0.0) }
    var hasPin by remember { mutableStateOf(base != null || (initialLat != null && initialLng != null)) }

    // Menu state
    var showOverflowMenu by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    // Fixed challenge dropdown state
    var fixedChallengeExpanded by remember { mutableStateOf(false) }

    // Map state
    val mapView = remember { MapView(context) }
    var mapInstance by remember { mutableStateOf<MapLibreMap?>(null) }
    var currentMarker by remember { mutableStateOf<Marker?>(null) }

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

    val title = if (isEditMode) base!!.name else stringResource(R.string.label_new_base)
    val canSave = name.isNotBlank() && hasPin

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.action_back))
                    }
                },
                actions = {
                    if (isEditMode) {
                        Box {
                            IconButton(onClick = { showOverflowMenu = true }) {
                                Icon(Icons.Default.MoreVert, contentDescription = null)
                            }
                            DropdownMenu(
                                expanded = showOverflowMenu,
                                onDismissRequest = { showOverflowMenu = false },
                            ) {
                                if (onDelete != null) {
                                    DropdownMenuItem(
                                        text = {
                                            Text(
                                                stringResource(R.string.label_delete_base),
                                                color = MaterialTheme.colorScheme.error,
                                            )
                                        },
                                        leadingIcon = {
                                            Icon(
                                                Icons.Default.Delete,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.error,
                                            )
                                        },
                                        onClick = {
                                            showOverflowMenu = false
                                            showDeleteDialog = true
                                        },
                                    )
                                }
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            // Embedded mini map
            Text(
                text = if (hasPin) "" else stringResource(R.string.label_tap_map_to_set_location),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!hasPin) {
                Spacer(Modifier.height(4.dp))
            }
            AndroidView(
                factory = {
                    mapView.apply {
                        getMapAsync { map ->
                            mapInstance = map
                            map.uiSettings.isRotateGesturesEnabled = false
                            map.uiSettings.isTiltGesturesEnabled = false
                            map.setStyle(Style.Builder().fromUri(TileSources.getStyleUrl(null))) { style ->
                                if (hasPin) {
                                    val icon = IconFactory.getInstance(context)
                                        .fromBitmap(createPinBitmap(density))
                                    val marker = map.addMarker(
                                        MarkerOptions()
                                            .position(LatLng(pinLat, pinLng))
                                            .icon(icon),
                                    )
                                    currentMarker = marker
                                    map.moveCamera(
                                        CameraUpdateFactory.newLatLngZoom(LatLng(pinLat, pinLng), 15.0),
                                    )
                                }
                            }
                            map.addOnMapClickListener { point ->
                                pinLat = point.latitude
                                pinLng = point.longitude
                                hasPin = true
                                // Remove old marker and add new one
                                currentMarker?.let { map.removeMarker(it) }
                                val icon = IconFactory.getInstance(context)
                                    .fromBitmap(createPinBitmap(density))
                                val marker = map.addMarker(
                                    MarkerOptions()
                                        .position(LatLng(point.latitude, point.longitude))
                                        .icon(icon),
                                )
                                currentMarker = marker
                                map.animateCamera(
                                    CameraUpdateFactory.newLatLng(LatLng(point.latitude, point.longitude)),
                                )
                                true
                            }
                        }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
            )

            Spacer(Modifier.height(16.dp))

            // Name field
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(stringResource(R.string.label_base_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag("base-name-input"),
            )

            Spacer(Modifier.height(12.dp))

            // Description field
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.label_base_description)) },
                minLines = 3,
                maxLines = 5,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(20.dp))

            // Options section
            // Require presence toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.label_require_presence),
                    style = MaterialTheme.typography.bodyLarge,
                )
                Switch(
                    checked = requirePresence,
                    onCheckedChange = { requirePresence = it },
                )
            }

            Spacer(Modifier.height(8.dp))

            // Hidden base toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.label_hidden_base),
                    style = MaterialTheme.typography.bodyLarge,
                )
                Switch(
                    checked = hidden,
                    onCheckedChange = { hidden = it },
                )
            }

            // NFC section (edit mode only)
            if (isEditMode && onWriteNfc != null) {
                Spacer(Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Icon(
                            if (base?.nfcLinked == true) Icons.Default.CheckCircle else Icons.Default.Nfc,
                            contentDescription = null,
                            tint = if (base?.nfcLinked == true) StatusCompleted else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            text = stringResource(
                                if (base?.nfcLinked == true) R.string.label_nfc_linked
                                else R.string.label_nfc_not_linked,
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                Spacer(Modifier.height(8.dp))

                Button(
                    onClick = onWriteNfc,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(Icons.Default.Nfc, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(stringResource(R.string.label_write_nfc))
                }
            }

            Spacer(Modifier.height(12.dp))

            // Fixed challenge dropdown
            val selectedChallengeName = fixedChallengeId?.let { fid ->
                challenges.firstOrNull { it.id == fid }?.title
            } ?: stringResource(R.string.label_none)

            ExposedDropdownMenuBox(
                expanded = fixedChallengeExpanded,
                onExpandedChange = { fixedChallengeExpanded = it },
            ) {
                OutlinedTextField(
                    value = selectedChallengeName,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text(stringResource(R.string.label_fixed_challenge)) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = fixedChallengeExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = fixedChallengeExpanded,
                    onDismissRequest = { fixedChallengeExpanded = false },
                ) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.label_none)) },
                        onClick = {
                            fixedChallengeId = null
                            fixedChallengeExpanded = false
                        },
                    )
                    challenges.forEach { challenge ->
                        DropdownMenuItem(
                            text = { Text(challenge.title) },
                            onClick = {
                                fixedChallengeId = challenge.id
                                fixedChallengeExpanded = false
                            },
                        )
                    }
                }
            }

            // Challenges section (edit mode only)
            if (isEditMode) {
                Spacer(Modifier.height(24.dp))
                Text(
                    text = stringResource(R.string.label_challenges_at_base, linkedChallenges.size),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(8.dp))
                linkedChallenges.forEach { challenge ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = challenge.title,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                Icons.Default.Star,
                                contentDescription = null,
                                tint = StarGold,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = stringResource(R.string.label_pts, challenge.points),
                                style = MaterialTheme.typography.labelSmall,
                                color = StarGold,
                            )
                        }
                    }
                }
                if (onNavigateToCreateChallenge != null && base != null) {
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = { onNavigateToCreateChallenge(base.id) }) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.size(4.dp))
                        Text(stringResource(R.string.label_add_challenge))
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            // Save button
            Button(
                onClick = {
                    if (isEditMode) {
                        onSave(
                            UpdateBaseRequest(
                                name = name,
                                description = description,
                                lat = pinLat,
                                lng = pinLng,
                                fixedChallengeId = fixedChallengeId,
                                requirePresenceToSubmit = requirePresence,
                                hidden = hidden,
                            ),
                        )
                    } else {
                        onSave(
                            CreateBaseRequest(
                                name = name,
                                description = description,
                                lat = pinLat,
                                lng = pinLng,
                                fixedChallengeId = fixedChallengeId,
                                requirePresenceToSubmit = requirePresence,
                                hidden = hidden,
                            ),
                        )
                    }
                },
                enabled = canSave,
                modifier = Modifier.fillMaxWidth().testTag("base-save-btn"),
            ) {
                Text(stringResource(R.string.action_save))
            }

            Spacer(Modifier.height(24.dp))
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog && onDelete != null) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.label_delete_base)) },
            text = { Text(stringResource(R.string.label_delete_base_confirm)) },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    onDelete()
                }) {
                    Text(
                        stringResource(R.string.label_delete_base),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

/**
 * Creates a simple red pin bitmap for the map marker.
 */
private fun createPinBitmap(density: Float): Bitmap {
    val circleDiameterPx = (28 * density).toInt()
    val triangleHeightPx = (6 * density).toInt()
    val shadowPx = (3 * density).toInt()
    val width = circleDiameterPx + shadowPx * 2
    val height = circleDiameterPx + triangleHeightPx + shadowPx * 2
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    val cx = width / 2f
    val radius = circleDiameterPx / 2f
    val cy = radius + shadowPx

    val colorInt = android.graphics.Color.parseColor("#D32F2F")

    // Shadow
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = colorInt
        alpha = 80
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

    // White dot in center
    val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = android.graphics.Color.WHITE
        style = Paint.Style.FILL
    }
    canvas.drawCircle(cx, cy, radius * 0.3f, dotPaint)

    return bitmap
}
