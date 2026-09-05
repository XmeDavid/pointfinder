package com.prayer.pointfinder.device

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.webkit.WebView
import android.view.ViewTreeObserver
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import androidx.core.content.FileProvider
import java.io.File

@InvokeArg
class ShareArgs { lateinit var path: String; lateinit var contentType: String }

@TauriPlugin
class DevicePlugin(private val activity: Activity) : Plugin(activity) {
    private var hostView: WebView? = null
    private var lastInsets: String? = null
    private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener {
        val data = insetData()
        if (data != null && data.toString() != lastInsets) {
            lastInsets = data.toString()
            trigger("safeAreaChanged", data)
        }
    }

    override fun load(webView: WebView) {
        hostView = webView
        webView.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    }

    override fun onDestroy(activity: AppCompatActivity) {
        hostView?.viewTreeObserver?.removeOnGlobalLayoutListener(layoutListener)
        hostView = null
    }

    private fun insetData(): JSObject? {
        val view = hostView ?: return null
        val root = activity.window.decorView
        val windowInsets = ViewCompat.getRootWindowInsets(root) ?: return null
        val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        val origin = IntArray(2).also { root.getLocationOnScreen(it) }
        val position = IntArray(2).also { view.getLocationOnScreen(it) }
        val x = position[0] - origin[0]
        val y = position[1] - origin[1]
        val density = view.resources.displayMetrics.density
        // Only report overlap with the WebView. Already-inset/keyboard-resized
        // views must not acquire a second copy of the system-bar padding.
        return JSObject().apply {
            put("top", (insets.top - y).coerceIn(0, view.height) / density)
            put("left", (insets.left - x).coerceIn(0, view.width) / density)
            put("bottom", (y + view.height - (root.height - insets.bottom)).coerceIn(0, view.height) / density)
            put("right", (x + view.width - (root.width - insets.right)).coerceIn(0, view.width) / density)
        }
    }

    @Command
    fun safeAreaInsets(invoke: Invoke) {
        activity.runOnUiThread {
            val data = insetData()
            if (data == null) invoke.reject("unavailable: No window insets") else invoke.resolve(data)
        }
    }

    override fun onResume() { trigger("foreground", JSObject().apply { put("active", true) }) }
    override fun onPause() { trigger("foreground", JSObject().apply { put("active", false) }) }

    @Command
    fun shareFile(invoke: Invoke) {
        val args = invoke.parseArgs(ShareArgs::class.java)
        activity.runOnUiThread {
            try {
                val file = File(args.path).canonicalFile
                val root = File(activity.cacheDir, "shared").canonicalFile
                if (!file.path.startsWith(root.path + File.separator) || !file.isFile) {
                    invoke.reject("invalid: File is outside app exports")
                    return@runOnUiThread
                }
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = args.contentType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    clipData = ClipData.newRawUri(file.name, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                activity.startActivity(Intent.createChooser(send, null))
                // Android reports chooser dispatch, not successful delivery.
                invoke.resolve(JSObject().apply { put("result", "shared") })
            } catch (error: Exception) { invoke.reject("failed: ${error.message}") }
        }
    }
}
