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

@Singleton
class NfcEventBus @Inject constructor() {
    private val _scannedPayloads = MutableSharedFlow<NfcTagPayload?>(extraBufferCapacity = 1)
    val scannedPayloads: SharedFlow<NfcTagPayload?> = _scannedPayloads.asSharedFlow()

    /** Legacy accessor — maps payloads to just the base ID for existing consumers. */
    private val _scannedBaseIds = MutableSharedFlow<String?>(extraBufferCapacity = 1)
    val scannedBaseIds: SharedFlow<String?> = _scannedBaseIds.asSharedFlow()

    private val _discoveredTags = MutableSharedFlow<Tag>(extraBufferCapacity = 1)
    val discoveredTags: SharedFlow<Tag> = _discoveredTags.asSharedFlow()

    private val _deepLinkBaseId = MutableStateFlow<String?>(null)
    val deepLinkBaseId: StateFlow<String?> = _deepLinkBaseId.asStateFlow()

    fun emitScannedPayload(payload: NfcTagPayload?) {
        _scannedPayloads.tryEmit(payload)
        _scannedBaseIds.tryEmit(payload?.baseId)
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
