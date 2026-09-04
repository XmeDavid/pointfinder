package com.prayer.pointfinder.push

import app.tauri.plugin.JSObject
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives FCM callbacks. Background "notification" messages are shown by
 * the system without calling this; foreground messages and all "data"
 * messages arrive here and are forwarded to the web view.
 */
class PushMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        PushBridge.onNewToken(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = JSObject()
        for ((k, v) in remoteMessage.data) data.put(k, v)
        val message = JSObject().apply {
            put("title", remoteMessage.notification?.title)
            put("body", remoteMessage.notification?.body)
            put("data", data)
            put("messageId", remoteMessage.messageId)
        }
        PushBridge.onMessage(message)
    }
}
