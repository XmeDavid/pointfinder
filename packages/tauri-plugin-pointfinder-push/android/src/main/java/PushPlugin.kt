package com.prayer.pointfinder.push

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.messaging.FirebaseMessaging

private const val ALIAS = "notification"

/**
 * Push notifications through Firebase Cloud Messaging.
 *
 * Requires the app to apply the Google Services Gradle plugin and ship a
 * google-services.json. When Firebase is not configured, `register` rejects
 * with `unavailable` instead of crashing, so the app still runs.
 */
@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = ALIAS)
    ]
)
class PushPlugin(private val activity: Activity) : Plugin(activity) {

    private var launchTap: JSObject? = null

    override fun load(webView: WebView) {
        PushBridge.attach(this)
        // A tap on a system-shown notification launches the activity with
        // the message data as extras.
        extractTap(activity.intent)?.let { launchTap = it }
    }

    override fun onNewIntent(intent: Intent) {
        extractTap(intent)?.let { tap ->
            launchTap = tap
            trigger("notificationTap", tap)
        }
    }

    // ---------------------------------------------------------------- permissions

    @Command
    fun permissionStatus(invoke: Invoke) {
        invoke.resolve(JSObject().apply { put("status", currentStatus()) })
    }

    @Command
    fun requestPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            invoke.resolve(JSObject().apply { put("status", "granted") })
            return
        }
        requestPermissionForAlias(ALIAS, invoke, "permissionCallback")
    }

    @PermissionCallback
    private fun permissionCallback(invoke: Invoke) {
        invoke.resolve(JSObject().apply { put("status", currentStatus()) })
    }

    private fun currentStatus(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted"
        return when (getPermissionState(ALIAS)) {
            app.tauri.PermissionState.GRANTED -> "granted"
            app.tauri.PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
    }

    // ---------------------------------------------------------------- registration

    @Command
    fun register(invoke: Invoke) {
        try {
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    invoke.resolve(JSObject().apply {
                        put("token", token)
                        put("platform", "android")
                    })
                }
                .addOnFailureListener { e -> invoke.reject("registrationFailed: ${e.message}") }
        } catch (e: Exception) {
            // Firebase not initialised: no google-services.json in this build.
            invoke.reject("unavailable")
        }
    }

    @Command
    fun unregister(invoke: Invoke) {
        try {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
            FirebaseMessaging.getInstance().deleteToken()
                .addOnSuccessListener { invoke.resolve() }
                .addOnFailureListener { error -> invoke.reject("registrationFailed: ${error.message}") }
        } catch (_: Exception) { invoke.resolve() }
    }

    /** The notification tap that launched the app, once. */
    @Command
    fun consumeLaunchTap(invoke: Invoke) {
        val tap = launchTap
        launchTap = null
        invoke.resolve(JSObject().apply { put("tap", tap) })
    }

    // ---------------------------------------------------------------- bridge entry points

    fun emitToken(token: String) {
        trigger("token", JSObject().apply {
            put("token", token)
            put("platform", "android")
        })
    }

    fun emitNotification(message: JSObject) {
        trigger("notification", message)
    }

    private fun extractTap(intent: Intent?): JSObject? {
        val extras = intent?.extras ?: return null
        // Only an intent produced by tapping an FCM notification carries the
        // message id. Anything else (NFC tags, deep links, plain launches) is
        // not a notification tap and must not be sniffed.
        if (!extras.containsKey("google.message_id")) return null
        val data = JSObject()
        for (key in extras.keySet()) {
            if (key.startsWith("google.") || key.startsWith("gcm.") || key == "from" || key == "collapse_key") continue
            @Suppress("DEPRECATION")
            val v = extras.get(key)
            if (v is String) data.put(key, v)
        }
        return JSObject().apply { put("data", data) }
    }
}
