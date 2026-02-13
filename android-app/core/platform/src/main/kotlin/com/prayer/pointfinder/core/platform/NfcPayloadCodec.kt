package com.prayer.pointfinder.core.platform

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import java.nio.charset.StandardCharsets
import org.json.JSONObject

object NfcPayloadCodec {
    private const val TAG_URL_PREFIX = "https://desbravadores.dev/tag/"
    private const val APP_PACKAGE = "com.prayer.pointfinder"

    fun buildBaseMessage(baseId: String): NdefMessage {
        val uriRecord = NdefRecord.createUri("$TAG_URL_PREFIX$baseId")
        val aarRecord = NdefRecord.createApplicationRecord(APP_PACKAGE)
        return NdefMessage(arrayOf(uriRecord, aarRecord))
    }

    fun parseBaseId(message: NdefMessage?): String? {
        val record = message?.records?.firstOrNull() ?: return null
        return parseBaseIdFromUri(record) ?: parseBaseIdFromJson(record)
    }

    /** New format: URL record with path /tag/{baseId} */
    private fun parseBaseIdFromUri(record: NdefRecord): String? {
        if (record.tnf != NdefRecord.TNF_WELL_KNOWN) return null
        return try {
            val uri = record.toUri()?.toString() ?: return null
            if (uri.startsWith(TAG_URL_PREFIX)) {
                uri.removePrefix(TAG_URL_PREFIX).takeIf { it.isNotBlank() }
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Legacy format: JSON MIME record with {"baseId": "..."} */
    private fun parseBaseIdFromJson(record: NdefRecord): String? {
        return try {
            val payload = String(record.payload, StandardCharsets.UTF_8)
            JSONObject(payload).optString("baseId").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
}
