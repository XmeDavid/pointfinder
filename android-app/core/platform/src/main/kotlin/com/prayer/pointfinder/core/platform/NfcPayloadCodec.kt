package com.prayer.pointfinder.core.platform

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.net.Uri
import java.nio.charset.StandardCharsets
import java.util.UUID
import org.json.JSONObject

data class NfcTagPayload(
    val baseId: String,
    val nfcToken: String? = null,
)

object NfcPayloadCodec {
    private const val PRIMARY_TAG_URL_PREFIX = "https://pointfinder.pt/tag/"
    private val SUPPORTED_TAG_URL_PREFIXES = listOf(
        "https://pointfinder.pt/tag/",
        "https://pointfinder.ch/tag/",
    )
    private const val APP_PACKAGE = "com.prayer.pointfinder"

    fun buildBaseMessage(baseId: String, nfcToken: String?): NdefMessage {
        val url = if (nfcToken != null) {
            "$PRIMARY_TAG_URL_PREFIX$baseId?t=$nfcToken"
        } else {
            "$PRIMARY_TAG_URL_PREFIX$baseId"
        }
        val uriRecord = NdefRecord.createUri(url)
        val aarRecord = NdefRecord.createApplicationRecord(APP_PACKAGE)
        return NdefMessage(arrayOf(uriRecord, aarRecord))
    }

    fun parsePayload(message: NdefMessage?): NfcTagPayload? {
        val record = message?.records?.firstOrNull() ?: return null
        return parsePayloadFromUri(record) ?: parsePayloadFromJson(record)
    }

    /** Legacy: returns just the base ID for callers that don't need the token. */
    fun parseBaseId(message: NdefMessage?): String? = parsePayload(message)?.baseId

    fun normalizeBaseId(rawBaseId: String?): String? {
        val trimmed = rawBaseId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val uuid = runCatching { UUID.fromString(trimmed) }.getOrNull()
        return uuid?.toString() ?: trimmed
    }

    /** New format: URL record with path /tag/{baseId}?t={token} */
    private fun parsePayloadFromUri(record: NdefRecord): NfcTagPayload? {
        if (record.tnf != NdefRecord.TNF_WELL_KNOWN) return null
        return try {
            val uriString = record.toUri()?.toString() ?: return null
            val baseIdRaw = SUPPORTED_TAG_URL_PREFIXES.firstNotNullOfOrNull { prefix ->
                if (uriString.startsWith(prefix)) {
                    uriString.removePrefix(prefix).takeIf { it.isNotBlank() }
                } else {
                    null
                }
            } ?: return null

            // Parse query parameter for token
            val uri = Uri.parse(
                SUPPORTED_TAG_URL_PREFIXES.first() + baseIdRaw,
            )
            val pathBaseId = uri.path?.removePrefix("/tag/")
            val normalizedId = normalizeBaseId(pathBaseId) ?: return null
            val token = uri.getQueryParameter("t")

            NfcTagPayload(baseId = normalizedId, nfcToken = token)
        } catch (_: Exception) {
            null
        }
    }

    /** Legacy format: JSON MIME record with {"baseId": "..."} */
    private fun parsePayloadFromJson(record: NdefRecord): NfcTagPayload? {
        return try {
            val payload = String(record.payload, StandardCharsets.UTF_8)
            val json = JSONObject(payload)
            val baseId = json.optString("baseId").takeIf { it.isNotBlank() } ?: return null
            val normalizedId = normalizeBaseId(baseId) ?: return null
            NfcTagPayload(baseId = normalizedId, nfcToken = null)
        } catch (_: Exception) {
            null
        }
    }
}
