package com.dbv.companion.core.platform

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.dbv.companion.core.model.LocationUpdateRequest
import com.dbv.companion.core.network.CompanionApi
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DeviceLocation(
    val lat: Double,
    val lng: Double,
)

@Singleton
class PlayerLocationService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: CompanionApi,
    private val networkMonitor: NetworkMonitor,
) {
    private val client: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val _lastLocation = MutableStateFlow<DeviceLocation?>(null)
    val lastLocation: StateFlow<DeviceLocation?> = _lastLocation.asStateFlow()

    private var gameId: String? = null
    private var scope: CoroutineScope? = null
    private var sendJob: Job? = null
    private var sentFirstLocation = false

    companion object {
        private const val TAG = "PlayerLocationService"
        private const val SEND_INTERVAL_MS = 30_000L
    }

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val value = result.lastLocation ?: return
            _lastLocation.value = DeviceLocation(value.latitude, value.longitude)

            // Send first location immediately (matches iOS behavior)
            if (!sentFirstLocation) {
                sentFirstLocation = true
                scope?.launch { sendCurrentLocation() }
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun start(gameId: String) {
        if (!hasLocationPermission()) return

        this.gameId = gameId
        this.sentFirstLocation = false

        // Create a new coroutine scope for location sending
        scope?.cancel()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

        // Bootstrap: request last known location immediately so we don't
        // have to wait for the first GPS callback (which can be slow indoors).
        client.lastLocation.addOnSuccessListener { location ->
            if (location != null && _lastLocation.value == null) {
                _lastLocation.value = DeviceLocation(location.latitude, location.longitude)
                if (!sentFirstLocation) {
                    sentFirstLocation = true
                    scope?.launch { sendCurrentLocation() }
                }
            }
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 30_000L)
            .setMinUpdateDistanceMeters(10f)
            .setWaitForAccurateLocation(false)
            .build()
        client.requestLocationUpdates(request, callback, context.mainLooper)

        // Start periodic send loop
        startPeriodicSend()
    }

    fun stop() {
        client.removeLocationUpdates(callback)
        sendJob?.cancel()
        sendJob = null
        scope?.cancel()
        scope = null
        gameId = null
        sentFirstLocation = false
    }

    /**
     * Send location immediately (e.g. after a check-in or submission).
     * Resets the periodic timer so the next send is a full interval later.
     */
    suspend fun sendLocationNow() {
        sendCurrentLocation()
        // Restart the periodic loop to avoid double-sending shortly after
        startPeriodicSend()
    }

    @SuppressLint("MissingPermission")
    fun requestSingleUpdate() {
        if (!hasLocationPermission()) return
        client.lastLocation.addOnSuccessListener { location ->
            if (location != null) {
                _lastLocation.value = DeviceLocation(location.latitude, location.longitude)
            }
        }
    }

    private fun startPeriodicSend() {
        sendJob?.cancel()
        sendJob = scope?.launch {
            while (true) {
                delay(SEND_INTERVAL_MS)
                sendCurrentLocation()
            }
        }
    }

    private suspend fun sendCurrentLocation() {
        val currentGameId = gameId ?: return
        val location = _lastLocation.value ?: return
        if (!networkMonitor.isOnline.value) return

        try {
            api.updateLocation(
                gameId = currentGameId,
                request = LocationUpdateRequest(lat = location.lat, lng = location.lng),
            )
        } catch (e: Exception) {
            Log.d(TAG, "Failed to send location: ${e.message}")
        }
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }
}
