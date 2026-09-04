package com.prayer.pointfinder.nfc

import android.animation.ValueAnimator
import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A bottom sheet that mirrors the iOS Core NFC system sheet: it appears when
 * a scan or write starts, shows a pulsing ring while waiting, flips to a
 * check mark on success or a short reason on failure, and dismisses itself.
 * Cancelling (button, back, tap outside) reports back so the caller can tear
 * the NFC session down, exactly as Core NFC does.
 *
 * Built from plain views on purpose: no theme or resource dependencies, so
 * it works in any host app.
 */
class NfcSheet(private val activity: Activity) {

    private val main = Handler(Looper.getMainLooper())
    private var dialog: Dialog? = null
    private var ring: RingView? = null
    private var title: TextView? = null
    private var cancelButton: Button? = null
    private var onCancel: (() -> Unit)? = null
    private var settled = false

    private val dark: Boolean
        get() = (activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()

    /** Show the sheet. Safe to call from any thread. */
    fun show(message: String, cancelLabel: String, onCancel: () -> Unit) {
        main.post {
            dismissNow()
            settled = false
            this.onCancel = onCancel
            val d = Dialog(activity)
            d.requestWindowFeature(Window.FEATURE_NO_TITLE)
            d.setContentView(buildContent(message, cancelLabel))
            d.setCancelable(true)
            d.setCanceledOnTouchOutside(true)
            d.setOnCancelListener { if (!settled) { settled = true; this.onCancel?.invoke() } }
            d.window?.let { w ->
                w.setBackgroundDrawableResource(android.R.color.transparent)
                w.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
                w.setGravity(Gravity.BOTTOM)
                w.setDimAmount(0.45f)
                w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            }
            dialog = d
            d.show()
            ring?.start()
        }
    }

    /** Flip to the success state, buzz, and dismiss shortly after. */
    fun succeed(message: String) {
        main.post {
            if (dialog == null) return@post
            settled = true
            ring?.showCheck()
            title?.text = message
            cancelButton?.visibility = View.INVISIBLE
            haptic()
            main.postDelayed({ dismissNow() }, 650)
        }
    }

    /** Show the failure reason briefly, then dismiss. */
    fun fail(message: String) {
        main.post {
            if (dialog == null) return@post
            settled = true
            ring?.showCross()
            title?.text = message
            cancelButton?.visibility = View.INVISIBLE
            main.postDelayed({ dismissNow() }, 1400)
        }
    }

    /** Dismiss without any state change (caller cancelled programmatically). */
    fun dismiss() {
        main.post { settled = true; dismissNow() }
    }

    private fun dismissNow() {
        ring?.stop()
        runCatching { dialog?.dismiss() }
        dialog = null
        ring = null
        title = null
        cancelButton = null
        onCancel = null
    }

    private fun haptic() {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (activity.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        // Feedback only: a missing permission or unsupported device must never fail the scan.
        runCatching { vibrator?.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE)) }
    }

    private fun buildContent(message: String, cancelLabel: String): View {
        val surface = if (dark) Color.parseColor("#1C1C1E") else Color.WHITE
        val text = if (dark) Color.WHITE else Color.parseColor("#111111")
        val muted = if (dark) Color.parseColor("#9A9A9E") else Color.parseColor("#6E6E73")

        val card = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            background = GradientDrawable().apply {
                setColor(surface)
                val r = dp(28).toFloat()
                cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            }
            setPadding(dp(24), dp(20), dp(24), dp(24))
        }

        // Grabber
        card.addView(View(activity).apply {
            background = GradientDrawable().apply { setColor(muted); cornerRadius = dp(3).toFloat() }
        }, LinearLayout.LayoutParams(dp(36), dp(5)).apply { bottomMargin = dp(18) })

        card.addView(TextView(activity).apply {
            this.text = "Ready to Scan"
            setTextColor(text)
            textSize = 22f
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(20)
        })

        ring = RingView(activity, accent = Color.parseColor("#2F7A4F"), fg = text)
        card.addView(ring, LinearLayout.LayoutParams(dp(140), dp(140)).apply { bottomMargin = dp(20) })

        title = TextView(activity).apply {
            this.text = message
            setTextColor(text)
            textSize = 17f
            gravity = Gravity.CENTER
        }
        card.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = dp(24)
        })

        cancelButton = Button(activity).apply {
            this.text = cancelLabel
            isAllCaps = false
            textSize = 17f
            setTextColor(text)
            background = GradientDrawable().apply {
                setColor(if (dark) Color.parseColor("#2C2C2E") else Color.parseColor("#EFEFF2"))
                cornerRadius = dp(14).toFloat()
            }
            setOnClickListener {
                if (!settled) { settled = true; onCancel?.invoke() }
                dismissNow()
            }
        }
        card.addView(cancelButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))

        return FrameLayout(activity).apply {
            addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
    }

    /** Pulsing rings while waiting; a check or cross once settled. */
    private class RingView(context: Context, private val accent: Int, private val fg: Int) : View(context) {
        private enum class State { WAITING, CHECK, CROSS }
        private var state = State.WAITING
        private var phase = 0f
        private val animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1600
            repeatCount = ValueAnimator.INFINITE
            interpolator = LinearInterpolator()
            addUpdateListener { phase = it.animatedValue as Float; invalidate() }
        }
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }

        fun start() { if (!animator.isRunning) animator.start() }
        fun stop() { animator.cancel() }
        fun showCheck() { stop(); state = State.CHECK; invalidate() }
        fun showCross() { stop(); state = State.CROSS; invalidate() }

        override fun onDraw(canvas: Canvas) {
            val cx = width / 2f; val cy = height / 2f
            val r = width / 2f - 6f
            when (state) {
                State.WAITING -> {
                    // Two expanding rings, offset by half a cycle, fading out.
                    for (k in 0..1) {
                        val p = (phase + k * 0.5f) % 1f
                        stroke.color = accent
                        stroke.alpha = ((1f - p) * 140).toInt()
                        stroke.strokeWidth = 4f
                        canvas.drawCircle(cx, cy, r * (0.35f + 0.65f * p), stroke)
                    }
                    fill.color = accent
                    canvas.drawCircle(cx, cy, r * 0.3f, fill)
                    // Signal arcs
                    stroke.color = Color.WHITE; stroke.alpha = 230; stroke.strokeWidth = 5f
                    val a = r * 0.16f
                    canvas.drawArc(cx - a, cy - a, cx + a, cy + a, -45f, 90f, false, stroke)
                    val b = r * 0.26f
                    canvas.drawArc(cx - b, cy - b, cx + b, cy + b, -45f, 90f, false, stroke)
                }
                State.CHECK -> {
                    fill.color = accent
                    canvas.drawCircle(cx, cy, r * 0.55f, fill)
                    stroke.color = Color.WHITE; stroke.alpha = 255; stroke.strokeWidth = 9f
                    val path = Path().apply {
                        moveTo(cx - r * 0.24f, cy + r * 0.02f)
                        lineTo(cx - r * 0.06f, cy + r * 0.2f)
                        lineTo(cx + r * 0.26f, cy - r * 0.18f)
                    }
                    canvas.drawPath(path, stroke)
                }
                State.CROSS -> {
                    fill.color = Color.parseColor("#B3261E")
                    canvas.drawCircle(cx, cy, r * 0.55f, fill)
                    stroke.color = Color.WHITE; stroke.alpha = 255; stroke.strokeWidth = 9f
                    val s = r * 0.2f
                    canvas.drawLine(cx - s, cy - s, cx + s, cy + s, stroke)
                    canvas.drawLine(cx - s, cy + s, cx + s, cy - s, stroke)
                }
            }
        }
    }
}
