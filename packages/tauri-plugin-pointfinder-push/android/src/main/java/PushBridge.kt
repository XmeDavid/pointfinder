package com.prayer.pointfinder.push

import app.tauri.plugin.JSObject

/**
 * Hands events from the Firebase service (which Android instantiates on its
 * own) to the plugin instance (which Tauri instantiates). Whichever side is
 * missing at the time, the event is buffered and delivered later.
 */
object PushBridge {
    @Volatile var plugin: PushPlugin? = null

    private val pendingTokens = ArrayDeque<String>()
    private val pendingMessages = ArrayDeque<JSObject>()

    @Synchronized
    fun onNewToken(token: String) {
        val p = plugin
        if (p != null) p.emitToken(token) else pendingTokens.addLast(token)
    }

    @Synchronized
    fun onMessage(message: JSObject) {
        val p = plugin
        if (p != null) p.emitNotification(message) else pendingMessages.addLast(message)
    }

    @Synchronized
    fun attach(p: PushPlugin) {
        plugin = p
        while (pendingTokens.isNotEmpty()) p.emitToken(pendingTokens.removeFirst())
        while (pendingMessages.isNotEmpty()) p.emitNotification(pendingMessages.removeFirst())
    }
}
