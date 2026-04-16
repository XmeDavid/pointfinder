package com.prayer.pointfinder.core.platform

import android.nfc.Tag
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Typed NFC scan event. A scan can either yield a parsed payload or
 * surface an invalid-tag signal so the UI can inform the user (mirrors
 * the iOS `NFCError.invalidData` path).
 */
sealed interface NfcScanEvent {
    data class Payload(val payload: NfcTagPayload) : NfcScanEvent
    data object InvalidPayload : NfcScanEvent
}

@Singleton
class NfcEventBus @Inject constructor() {
    private val _scannedPayloads = MutableSharedFlow<NfcTagPayload?>(extraBufferCapacity = 1)
    val scannedPayloads: SharedFlow<NfcTagPayload?> = _scannedPayloads.asSharedFlow()

    /** Legacy accessor — maps payloads to just the base ID for existing consumers. */
    private val _scannedBaseIds = MutableSharedFlow<String?>(extraBufferCapacity = 1)
    val scannedBaseIds: SharedFlow<String?> = _scannedBaseIds.asSharedFlow()

    /**
     * Typed scan events — used by consumers that need to distinguish
     * "tag discovered but payload unreadable" from "no tag present".
     * iOS parity: surfaces invalid-payload as a user-visible error
     * instead of dropping silently.
     */
    private val _scanEvents = MutableSharedFlow<NfcScanEvent>(extraBufferCapacity = 1)
    val scanEvents: SharedFlow<NfcScanEvent> = _scanEvents.asSharedFlow()

    private val _discoveredTags = MutableSharedFlow<Tag>(extraBufferCapacity = 1)
    val discoveredTags: SharedFlow<Tag> = _discoveredTags.asSharedFlow()

    private val _deepLinkBaseId = MutableStateFlow<String?>(null)
    val deepLinkBaseId: StateFlow<String?> = _deepLinkBaseId.asStateFlow()

    fun emitScannedPayload(payload: NfcTagPayload?) {
        _scannedPayloads.tryEmit(payload)
        _scannedBaseIds.tryEmit(payload?.baseId)
        if (payload != null) {
            _scanEvents.tryEmit(NfcScanEvent.Payload(payload))
        }
    }

    /**
     * Emit an explicit invalid-payload event when a tag was discovered but
     * the NDEF payload could not be parsed (malformed URL, unsupported
     * format, etc). Callers should use this instead of `emitScannedPayload(null)`
     * when they need to distinguish "bad data" from "no data".
     */
    fun emitInvalidPayload() {
        _scannedPayloads.tryEmit(null)
        _scannedBaseIds.tryEmit(null)
        _scanEvents.tryEmit(NfcScanEvent.InvalidPayload)
    }

    /** Legacy — prefer emitScannedPayload. */
    fun emitScannedBaseId(baseId: String?) {
        emitScannedPayload(baseId?.let { NfcTagPayload(baseId = it) })
    }

    fun emitDiscoveredTag(tag: Tag) {
        _discoveredTags.tryEmit(tag)
    }

    fun emitDeepLinkBaseId(baseId: String?) {
        _deepLinkBaseId.value = baseId
    }

    fun consumeDeepLinkBaseId() {
        _deepLinkBaseId.value = null
    }
}
