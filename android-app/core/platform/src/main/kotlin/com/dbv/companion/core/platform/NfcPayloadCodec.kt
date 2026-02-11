package com.dbv.companion.core.platform

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import java.nio.charset.StandardCharsets
import org.json.JSONObject

object NfcPayloadCodec {
    private val mediaType = "application/json".toByteArray(StandardCharsets.US_ASCII)

    fun buildBaseMessage(baseId: String): NdefMessage {
        val payload = JSONObject()
            .put("baseId", baseId)
            .toString()
            .toByteArray(StandardCharsets.UTF_8)
        val record = NdefRecord(
            NdefRecord.TNF_MIME_MEDIA,
            mediaType,
            ByteArray(0),
            payload,
        )
        return NdefMessage(arrayOf(record))
    }

    fun parseBaseId(message: NdefMessage?): String? {
        val record = message?.records?.firstOrNull() ?: return null
        return try {
            val payload = String(record.payload, StandardCharsets.UTF_8)
            JSONObject(payload).optString("baseId").takeIf { it.isNotBlank() }
        } catch (_: Exception) {
            null
        }
    }
}
