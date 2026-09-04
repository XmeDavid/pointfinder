package com.prayer.pointfinder

import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import android.util.Log
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import org.maplibre.android.MapLibre
import org.maplibre.android.offline.OfflineManager

@HiltAndroidApp
class CompanionApp : android.app.Application(), Configuration.Provider {
    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
        configureOfflineMapCache()
    }

    /**
     * Raises the MapLibre ambient tile cache from the default 50 MB to 100 MB so
     * previously-viewed tiles survive longer when players are at outdoor events
     * with poor connectivity (audit finding 8.12).
     */
    private fun configureOfflineMapCache() {
        val cacheSizeBytes = 100L * 1024 * 1024 // 100 MB
        OfflineManager.getInstance(this).setMaximumAmbientCacheSize(
            cacheSizeBytes,
            object : OfflineManager.FileSourceCallback {
                override fun onSuccess() {
                    Log.d("MapCache", "Ambient tile cache set to 100 MB")
                }
                override fun onError(message: String) {
                    Log.e("MapCache", "Failed to set ambient cache size: $message")
                }
            }
        )
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
