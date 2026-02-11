package com.dbv.companion.core.platform

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DeviceLocation(
    val lat: Double,
    val lng: Double,
)

@Singleton
class PlayerLocationService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val client: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val _lastLocation = MutableStateFlow<DeviceLocation?>(null)
    val lastLocation: StateFlow<DeviceLocation?> = _lastLocation.asStateFlow()

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val value = result.lastLocation ?: return
            _lastLocation.value = DeviceLocation(value.latitude, value.longitude)
        }
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (!hasLocationPermission()) return
        val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30_000L)
            .setMinUpdateDistanceMeters(10f)
            .setWaitForAccurateLocation(false)
            .build()
        client.requestLocationUpdates(request, callback, context.mainLooper)
    }

    fun stop() {
        client.removeLocationUpdates(callback)
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
