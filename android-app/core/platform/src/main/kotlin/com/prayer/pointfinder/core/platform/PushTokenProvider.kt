package com.prayer.pointfinder.core.platform

import com.google.firebase.messaging.FirebaseMessaging
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

@Singleton
class PushTokenProvider @Inject constructor() {
    suspend fun tokenOrNull(): String? {
        return try {
            suspendCancellableCoroutine { continuation ->
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { continuation.resume(it) }
                    .addOnFailureListener { continuation.resume(null) }
            }
        } catch (_: Exception) {
            // Firebase not configured (no google-services.json) or unavailable.
            null
        }
    }
}
