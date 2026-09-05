package com.prayer.pointfinder.device

import android.app.Activity
import android.content.ClipData
import android.content.Intent
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
