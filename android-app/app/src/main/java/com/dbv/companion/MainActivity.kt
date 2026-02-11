package com.dbv.companion

import android.os.Bundle
import android.nfc.NfcAdapter
import android.nfc.Tag
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.compose.setContent
import com.dbv.companion.navigation.AppNavigation
import com.dbv.companion.core.platform.NfcEventBus
import com.dbv.companion.core.platform.NfcService
import com.dbv.companion.ui.theme.DBVCompanionTheme
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
        setContent {
            DBVCompanionTheme {
                AppNavigation()
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
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
