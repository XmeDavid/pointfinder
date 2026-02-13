package com.prayer.pointfinder

import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.appcompat.app.AppCompatActivity
import com.prayer.pointfinder.core.platform.NfcEventBus
import com.prayer.pointfinder.core.platform.NfcService
import com.prayer.pointfinder.navigation.AppNavigation
import com.prayer.pointfinder.ui.theme.PointFinderTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {
    @Inject
    lateinit var nfcService: NfcService

    @Inject
    lateinit var nfcEventBus: NfcEventBus

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Handle NFC intent that launched the app (cold start)
        handleNfcIntent(intent)
        setContent {
            PointFinderTheme {
                AppNavigation()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Use reader mode instead of foreground dispatch.
        // Reader mode uses a direct callback (no PendingIntent), which avoids
        // Background Activity Launch (BAL) restrictions on Android 14+/API 35.
        nfcService.enableReaderMode(this) { tag ->
            val baseId = nfcService.parseBaseIdFromTag(tag)
            nfcEventBus.emitDiscoveredTag(tag)
            nfcEventBus.emitScannedBaseId(baseId)
        }
    }

    override fun onPause() {
        super.onPause()
        nfcService.disableReaderMode(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    /** Handle NFC intents delivered via manifest intent filters (app not in foreground). */
    private fun handleNfcIntent(intent: Intent?) {
        if (intent == null) return
        val scannedBaseId = nfcService.parseBaseIdFromIntent(intent)
        if (intent.hasExtra(NfcAdapter.EXTRA_TAG)) {
            @Suppress("DEPRECATION")
            val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)
            if (tag != null) {
                nfcEventBus.emitDiscoveredTag(tag)
            }
        }
        nfcEventBus.emitScannedBaseId(scannedBaseId)
    }
}
