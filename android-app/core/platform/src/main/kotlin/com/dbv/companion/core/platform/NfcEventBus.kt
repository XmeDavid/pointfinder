package com.dbv.companion.core.platform

import android.nfc.Tag
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

@Singleton
class NfcEventBus @Inject constructor() {
    private val _scannedBaseIds = MutableSharedFlow<String?>(extraBufferCapacity = 1)
    val scannedBaseIds: SharedFlow<String?> = _scannedBaseIds.asSharedFlow()

    private val _discoveredTags = MutableSharedFlow<Tag>(extraBufferCapacity = 1)
    val discoveredTags: SharedFlow<Tag> = _discoveredTags.asSharedFlow()

    fun emitScannedBaseId(baseId: String?) {
        _scannedBaseIds.tryEmit(baseId)
    }

    fun emitDiscoveredTag(tag: Tag) {
        _discoveredTags.tryEmit(tag)
    }
}
