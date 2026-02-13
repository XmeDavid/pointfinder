package com.prayer.pointfinder.core.platform

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NfcService @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(context)

    fun isAvailable(): Boolean = adapter != null

    fun enableReaderMode(
        activity: Activity,
        callback: (Tag) -> Unit,
    ) {
        val flags = NfcAdapter.FLAG_READER_NFC_A or
            NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_NFC_F or
            NfcAdapter.FLAG_READER_NFC_V
        adapter?.enableReaderMode(activity, callback, flags, null)
    }

    fun disableReaderMode(activity: Activity) {
        adapter?.disableReaderMode(activity)
    }

    fun parseBaseIdFromIntent(intent: Intent?): String? {
        val messages = intent?.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
            ?.mapNotNull { it as? NdefMessage }
            .orEmpty()
        val parsedFromMessage = messages.firstOrNull()?.let(NfcPayloadCodec::parseBaseId)
        if (parsedFromMessage != null) return parsedFromMessage

        // Some TAG_DISCOVERED deliveries omit EXTRA_NDEF_MESSAGES.
        @Suppress("DEPRECATION")
        val tag = intent?.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG) ?: return null
        return parseBaseIdFromTag(tag)
    }

    fun parseBaseIdFromTag(tag: Tag): String? {
        val ndef = Ndef.get(tag) ?: return null
        return NfcPayloadCodec.parseBaseId(ndef.cachedNdefMessage)
    }

    fun writeBaseTag(tag: Tag, baseId: String): Result<Unit> {
        val message = NfcPayloadCodec.buildBaseMessage(baseId)
        return runCatching {
            val ndef = Ndef.get(tag)
            if (ndef != null) {
                ndef.connect()
                ndef.writeNdefMessage(message)
                ndef.close()
                return@runCatching
            }
            val formatable = NdefFormatable.get(tag) ?: error("Tag does not support NDEF")
            formatable.connect()
            formatable.format(message)
            formatable.close()
        }
    }
}
