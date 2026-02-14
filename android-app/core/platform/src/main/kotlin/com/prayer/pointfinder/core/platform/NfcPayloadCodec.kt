package com.prayer.pointfinder.core.platform

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import java.nio.charset.StandardCharsets
import java.util.UUID
import org.json.JSONObject

object NfcPayloadCodec {
    private const val PRIMARY_TAG_URL_PREFIX = "https://pointfinder.pt/tag/"
    private val SUPPORTED_TAG_URL_PREFIXES = listOf(
        "https://pointfinder.pt/tag/",
        "https://pointfinder.ch/tag/",
    )
    private const val APP_PACKAGE = "com.prayer.pointfinder"

    fun buildBaseMessage(baseId: String): NdefMessage {
        val uriRecord = NdefRecord.createUri("$PRIMARY_TAG_URL_PREFIX$baseId")
        val aarRecord = NdefRecord.createApplicationRecord(APP_PACKAGE)
        return NdefMessage(arrayOf(uriRecord, aarRecord))
    }

    fun parseBaseId(message: NdefMessage?): String? {
        val record = message?.records?.firstOrNull() ?: return null
        val parsedBaseId = parseBaseIdFromUri(record) ?: parseBaseIdFromJson(record)
        return normalizeBaseId(parsedBaseId)
    }

    /**
     * Canonicalize NFC IDs so comparisons are stable across platforms.
     * UUID values are normalized to lowercase canonical form; other IDs are trimmed.
     */
    fun normalizeBaseId(rawBaseId: String?): String? {
        val trimmed = rawBaseId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val uuid = runCatching { UUID.fromString(trimmed) }.getOrNull()
        return uuid?.toString() ?: trimmed
    }

    /** New format: URL record with path /tag/{baseId} */
    private fun parseBaseIdFromUri(record: NdefRecord): String? {
        if (record.tnf != NdefRecord.TNF_WELL_KNOWN) return null
        return try {
            val uri = record.toUri()?.toString() ?: return null
            SUPPORTED_TAG_URL_PREFIXES.firstNotNullOfOrNull { prefix ->
                if (uri.startsWith(prefix)) {
                    uri.removePrefix(prefix).takeIf { it.isNotBlank() }
                } else {
                    null
                }
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
