package com.prayer.pointfinder

import android.app.PendingIntent
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
        handleNfcIntent(intent)
        setContent {
            PointFinderTheme {
                AppNavigation()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        val intent = Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_MUTABLE,
        )
        NfcAdapter.getDefaultAdapter(this)?.enableForegroundDispatch(
            this, pendingIntent, null, null,
        )
    }

    override fun onPause() {
        super.onPause()
        NfcAdapter.getDefaultAdapter(this)?.disableForegroundDispatch(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNfcIntent(intent)
    }

    private fun handleNfcIntent(intent: Intent?) {
        if (intent == null) return
        val scannedBaseId = nfcService.parseBaseIdFromIntent(intent)
        if (intent.hasExtra(NfcAdapter.EXTRA_TAG)) {
            val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)
            if (tag != null) {
                nfcEventBus.emitDiscoveredTag(tag)
            }
        }
        nfcEventBus.emitScannedBaseId(scannedBaseId)
    }
}
