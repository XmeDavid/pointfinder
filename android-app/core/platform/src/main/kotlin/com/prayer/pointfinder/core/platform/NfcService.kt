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

    fun parsePayloadFromTag(tag: Tag): NfcTagPayload? {
        val ndef = Ndef.get(tag) ?: return null
        return NfcPayloadCodec.parsePayload(ndef.cachedNdefMessage)
    }

    fun writeBaseTag(tag: Tag, baseId: String, nfcToken: String? = null): Result<Unit> {
        val message = NfcPayloadCodec.buildBaseMessage(baseId, nfcToken)
        val expectedBaseId = NfcPayloadCodec.normalizeBaseId(baseId) ?: baseId
        return runCatching {
            val ndef = Ndef.get(tag)
            if (ndef != null) {
                ndef.connect()
                try {
                    ndef.writeNdefMessage(message)
                    // Post-write verification (iOS parity). Re-read the
                    // tag's NDEF content and confirm baseId + token match
                    // what we just wrote. If the re-read fails (tag
                    // removed, I/O glitch), we accept the uncertainty and
                    // treat as possible success rather than false-negative
                    // the user — the time budget for verify must stay <200ms.
                    verifyWrittenPayload(
                        cached = runCatching { ndef.ndefMessage }.getOrNull()
                            ?: ndef.cachedNdefMessage,
                        expectedBaseId = expectedBaseId,
                        expectedToken = nfcToken,
                    )
                } finally {
                    ndef.close()
                }
                return@runCatching
            }
            val formatable = NdefFormatable.get(tag) ?: error("Tag does not support NDEF")
            formatable.connect()
            try {
                formatable.format(message)
                // Newly-formatted tag: re-open as Ndef to verify the round-trip.
                val reopened = runCatching {
                    Ndef.get(tag)?.also { it.connect() }
                }.getOrNull()
                try {
                    val cached = reopened?.let {
                        runCatching { it.ndefMessage }.getOrNull() ?: it.cachedNdefMessage
                    }
                    verifyWrittenPayload(
                        cached = cached,
                        expectedBaseId = expectedBaseId,
                        expectedToken = nfcToken,
                    )
                } finally {
                    runCatching { reopened?.close() }
                }
            } finally {
                formatable.close()
            }
        }
    }

    /**
     * Round-trip verification after a successful write. Decodes the cached
     * message via [NfcPayloadCodec] and confirms the baseId/token match.
     * Throws on verifiable mismatch. A null cached message (tag removed
     * too fast) is treated as "could not verify, accept" — mirrors the iOS
     * 200ms budget: do not penalise the user for a valid write the OS
     * simply could not re-read in time.
     */
    private fun verifyWrittenPayload(
        cached: android.nfc.NdefMessage?,
        expectedBaseId: String,
        expectedToken: String?,
    ) {
        val parsed = NfcPayloadCodec.parsePayload(cached) ?: return
        if (parsed.baseId != expectedBaseId) {
            error("NFC write verification failed: baseId mismatch")
        }
        if (expectedToken != null && parsed.nfcToken != expectedToken) {
            error("NFC write verification failed: token mismatch")
        }
    }
}
