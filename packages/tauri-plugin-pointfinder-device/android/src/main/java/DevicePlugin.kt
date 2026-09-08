package com.prayer.pointfinder.device

import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.view.Surface
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
import org.json.JSONObject

@InvokeArg
class ShareArgs { lateinit var path: String; lateinit var contentType: String }

@TauriPlugin
class DevicePlugin(private val activity: Activity) : Plugin(activity), SensorEventListener {
    private var hostView: WebView? = null
    private var lastInsets: String? = null
    private val sensors by lazy { activity.getSystemService(Context.SENSOR_SERVICE) as SensorManager }
    private var orientationRequested = false
    private var orientationListening = false
    private var foreground = true
    private val rotation = FloatArray(9)
    private val screenRotation = FloatArray(9)
    private val angles = FloatArray(3)
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
        orientationRequested = false
        suspendOrientation()
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

    override fun onResume() {
        foreground = true
        resumeOrientation()
        trigger("foreground", JSObject().apply { put("active", true) })
    }
    override fun onPause() {
        foreground = false
        suspendOrientation()
        trigger("foreground", JSObject().apply { put("active", false) })
    }

    @Command
    fun startOrientation(invoke: Invoke) {
        activity.runOnUiThread {
            if (sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) == null) {
                invoke.reject("unavailable: No orientation sensor")
                return@runOnUiThread
            }
            orientationRequested = true
            resumeOrientation()
            if (foreground && !orientationListening) {
                orientationRequested = false
                invoke.reject("unavailable: Could not start orientation")
            } else invoke.resolve()
        }
    }

    @Command
    fun stopOrientation(invoke: Invoke) {
        activity.runOnUiThread {
            orientationRequested = false
            suspendOrientation()
            invoke.resolve()
        }
    }

    private fun resumeOrientation() {
        if (!orientationRequested || !foreground || orientationListening) return
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
        orientationListening = sensors.registerListener(this, sensor, 33_333)
    }

    private fun suspendOrientation() {
        if (orientationListening) sensors.unregisterListener(this)
        orientationListening = false
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!orientationRequested || !foreground || !orientationListening) return
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        // Sensor axes follow natural device orientation, even on landscape-native tablets.
        val (x, y) = when (hostView?.display?.rotation) {
            Surface.ROTATION_90 -> SensorManager.AXIS_Y to SensorManager.AXIS_MINUS_X
            Surface.ROTATION_180 -> SensorManager.AXIS_MINUS_X to SensorManager.AXIS_MINUS_Y
            Surface.ROTATION_270 -> SensorManager.AXIS_MINUS_Y to SensorManager.AXIS_X
            else -> SensorManager.AXIS_X to SensorManager.AXIS_Y
        }
        SensorManager.remapCoordinateSystem(rotation, x, y, screenRotation)
        SensorManager.getOrientation(screenRotation, angles)
        val heading = (Math.toDegrees(angles[0].toDouble()) + 360) % 360
        trigger("orientation", JSObject().apply {
            put("heading", if (event.accuracy == SensorManager.SENSOR_STATUS_UNRELIABLE) JSONObject.NULL else heading)
            // Match Core Motion: positive pitch when the top of the phone tilts up.
            put("pitch", -Math.toDegrees(angles[1].toDouble()))
            put("roll", -Math.toDegrees(angles[2].toDouble()))
        })
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

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
