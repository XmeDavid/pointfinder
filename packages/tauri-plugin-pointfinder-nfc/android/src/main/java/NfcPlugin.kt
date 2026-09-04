package com.prayer.pointfinder.nfc

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.os.Bundle
import android.util.Base64
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.IOException
import java.util.concurrent.atomic.AtomicReference

@InvokeArg
class ScanArgs {
    var message: String? = null
    var successMessage: String? = null
    var cancelLabel: String? = null
    /** Milliseconds to wait for a tag before rejecting with `timeout`. 0 or null waits forever. */
    var timeoutMs: Long? = null
}

@InvokeArg
class WriteArgs {
    lateinit var url: String
    /** Re-read the tag after writing and compare. Null means true. */
    var verify: Boolean? = null
    /** Also write an Android Application Record so a tap launches this app. Null means true. */
    var applicationRecord: Boolean? = null
    var message: String? = null
    var successMessage: String? = null
    var cancelLabel: String? = null
    var timeoutMs: Long? = null
}

/**
 * NDEF URL tag plugin.
 *
 * Reading uses reader mode exclusively: no foreground dispatch, no
 * PendingIntent, so it keeps working under the background-activity
 * restrictions of Android 14 and later. A tag that launched the app
 * (cold start through the manifest NDEF_DISCOVERED filter) is buffered
 * and handed over through `consumePendingTag`.
 *
 * All tag I/O runs on the reader-mode callback thread, never on main.
 */
@TauriPlugin
class NfcPlugin(private val activity: Activity) : Plugin(activity) {

    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)

    /** The iOS-style system sheet shown while a scan or write is waiting. */
    private val sheet = NfcSheet(activity)

    /** Success text for the pending scan, shown on the sheet. */
    @Volatile private var scanSuccessMessage: String? = null

    /** JS asked for passive listening; reader mode stays armed while the activity is resumed. */
    @Volatile private var listening = false

    /** Whether reader mode is currently enabled on the activity, to avoid disabling twice. */
    @Volatile private var armed = false

    /** One-shot scan waiting for the next tag. */
    private val pendingScan = AtomicReference<Invoke?>(null)

    /** Write waiting for the next tag. */
    private val pendingWrite = AtomicReference<PendingWrite?>(null)

    /** Tag that arrived before JS subscribed (cold start or early tap), with its arrival time. */
    private val pendingTag = AtomicReference<Pair<JSObject, Long>?>(null)

    /** A buffered tag older than this is stale: never replay it as a fresh tap. */
    private val pendingTagMaxAgeMs = 60_000L

    private class PendingWrite(val invoke: Invoke, val args: WriteArgs)

    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityResumed(a: Activity) { if (a === activity) syncReaderMode() }
        override fun onActivityPaused(a: Activity) { if (a === activity && armed) { adapter?.disableReaderMode(activity); armed = false } }
        override fun onActivityCreated(a: Activity, b: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityStopped(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
        override fun onActivityDestroyed(a: Activity) {}
    }

    override fun load(webView: WebView) {
        activity.application.registerActivityLifecycleCallbacks(lifecycle)
        // Cold start by tag: the launching intent carries the NDEF payload.
        handleIntent(activity.intent)
    }

    override fun onNewIntent(intent: Intent) {
        handleIntent(intent)
    }

    // ---------------------------------------------------------------- commands

    @Command
    fun isAvailable(invoke: Invoke) {
        val ret = JSObject()
        ret.put("available", adapter != null)
        ret.put("enabled", adapter?.isEnabled == true)
        invoke.resolve(ret)
    }

    @Command
    fun startListening(invoke: Invoke) {
        if (adapter == null) { invoke.reject("unavailable"); return }
        listening = true
        syncReaderMode()
        invoke.resolve()
    }

    @Command
    fun stopListening(invoke: Invoke) {
        listening = false
        syncReaderMode()
        invoke.resolve()
    }

    @Command
    fun scan(invoke: Invoke) {
        if (adapter == null) { invoke.reject("unavailable"); return }
        if (!adapter.isEnabled) { invoke.reject("disabled"); return }
        val args = invoke.parseArgs(ScanArgs::class.java)
        cancelPending("cancelled")
        scanSuccessMessage = args.successMessage
        pendingScan.set(invoke)
        sheet.show(args.message ?: DEFAULT_SCAN_MESSAGE, args.cancelLabel ?: DEFAULT_CANCEL) {
            // User cancelled from the sheet (button, back, or tap outside).
            cancelPending("cancelled")
            syncReaderMode()
        }
        syncReaderMode()
        scheduleTimeout(args.timeoutMs) {
            pendingScan.getAndSet(null)?.let { it.reject("timeout"); sheet.fail("Timed out"); syncReaderMode() }
        }
    }

    @Command
    fun cancelScan(invoke: Invoke) {
        cancelPending("cancelled")
        sheet.dismiss()
        syncReaderMode()
        invoke.resolve()
    }

    @Command
    fun write(invoke: Invoke) {
        if (adapter == null) { invoke.reject("unavailable"); return }
        if (!adapter.isEnabled) { invoke.reject("disabled"); return }
        val args = invoke.parseArgs(WriteArgs::class.java)
        cancelPending("cancelled")
        pendingWrite.set(PendingWrite(invoke, args))
        sheet.show(args.message ?: DEFAULT_WRITE_MESSAGE, args.cancelLabel ?: DEFAULT_CANCEL) {
            cancelPending("cancelled")
            syncReaderMode()
        }
        syncReaderMode()
        scheduleTimeout(args.timeoutMs) {
            pendingWrite.getAndSet(null)?.let { it.invoke.reject("timeout"); sheet.fail("Timed out"); syncReaderMode() }
        }
    }

    /** Reject whichever one-shot operation is waiting, without touching the sheet. */
    private fun cancelPending(reason: String) {
        pendingScan.getAndSet(null)?.reject(reason)
        pendingWrite.getAndSet(null)?.invoke?.reject(reason)
    }

    private fun succeedWrite(pw: PendingWrite, result: JSObject) {
        sheet.succeed(pw.args.successMessage ?: DEFAULT_WRITE_SUCCESS)
        pw.invoke.resolve(result)
    }

    private fun failWrite(pw: PendingWrite, code: String) {
        sheet.fail(humanize(code))
        pw.invoke.reject(code)
    }

    /** Short on-sheet text for an error code; the app can localise via the rejection code. */
    private fun humanize(code: String): String = when (code.substringBefore(':')) {
        "invalid" -> "This tag has no readable data"
        "notWritable" -> "This tag is read-only"
        "tooLarge" -> "This tag is too small for the data"
        "verifyMismatch" -> "Written data did not verify"
        "tagLost" -> "Tag moved away too soon"
        "timeout" -> "Timed out"
        else -> "Could not complete"
    }

    private companion object {
        const val DEFAULT_SCAN_MESSAGE = "Hold your phone near the tag"
        const val DEFAULT_WRITE_MESSAGE = "Hold your phone near the tag to write"
        const val DEFAULT_SCAN_SUCCESS = "Tag read"
        const val DEFAULT_WRITE_SUCCESS = "Tag written"
        const val DEFAULT_CANCEL = "Cancel"
    }

    /** Returns the buffered tag (cold start or tap before subscription) once, or null. */
    @Command
    fun consumePendingTag(invoke: Invoke) {
        val pending = pendingTag.getAndSet(null)
        val fresh = pending != null && System.currentTimeMillis() - pending.second <= pendingTagMaxAgeMs
        val ret = JSObject()
        ret.put("tag", if (fresh) pending!!.first else null)
        invoke.resolve(ret)
    }

    // ---------------------------------------------------------------- reader mode

    private fun syncReaderMode() {
        val adapter = adapter ?: return
        val wanted = listening || pendingScan.get() != null || pendingWrite.get() != null
        if (wanted) {
            // Deliberately NOT FLAG_READER_SKIP_NDEF_CHECK: with it Android
            // never attaches the Ndef technology to the tag, so nothing can be
            // read without raw T2T commands. The service's own NDEF check takes
            // ~20 ms on a steady tag and hands us the message already read.
            val flags = NfcAdapter.FLAG_READER_NFC_A or
                NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or
                NfcAdapter.FLAG_READER_NFC_V
            val extras = Bundle().apply {
                // Default is 125 ms, too short for connect + write + re-read on slow tags.
                putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250)
            }
            activity.runOnUiThread {
                adapter.enableReaderMode(activity, ::onTagDiscovered, flags, extras)
                armed = true
            }
        } else if (armed) {
            activity.runOnUiThread {
                adapter.disableReaderMode(activity)
                armed = false
            }
        }
    }

    /** Runs on the NFC binder thread. Tag I/O is safe here. */
    private fun onTagDiscovered(tag: Tag) {
        pendingWrite.getAndSet(null)?.let { pw ->
            performWrite(tag, pw)
            syncReaderMode()
            return
        }
        val payload = readTag(tag)
        val scan = pendingScan.getAndSet(null)
        if (scan != null) {
            if (payload == null) {
                sheet.fail(humanize("invalid"))
                scan.reject("invalid")
            } else {
                sheet.succeed(scanSuccessMessage ?: DEFAULT_SCAN_SUCCESS)
                scan.resolve(payload)
            }
            syncReaderMode()
            return
        }
        if (payload != null) {
            pendingTag.set(payload to System.currentTimeMillis())
            trigger("tag", payload)
        } else {
            trigger("invalidTag", JSObject())
        }
    }

    // ---------------------------------------------------------------- intents

    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action != NfcAdapter.ACTION_NDEF_DISCOVERED &&
            intent.action != NfcAdapter.ACTION_TAG_DISCOVERED &&
            intent.action != NfcAdapter.ACTION_TECH_DISCOVERED) return

        @Suppress("DEPRECATION")
        val messages = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
            ?.mapNotNull { it as? NdefMessage }.orEmpty()
        @Suppress("DEPRECATION")
        val tag = intent.getParcelableExtra<Tag>(NfcAdapter.EXTRA_TAG)

        val payload = messages.firstOrNull()?.let { toPayload(it, tag) }
            ?: tag?.let { readTag(it) }
        if (payload != null) {
            pendingTag.set(payload to System.currentTimeMillis())
            trigger("tag", payload)
        }
    }

    // ---------------------------------------------------------------- read / write

    /**
     * Read the NDEF message ourselves. The tag is still in the field when
     * this runs, so a transient I/O error (weak coupling, hand still moving)
     * is retried a few times before giving up.
     */
    private fun readTag(tag: Tag): JSObject? {
        val ndef = Ndef.get(tag) ?: return null
        // The service already read the message during its NDEF check; use it
        // and avoid a second round trip over the air.
        ndef.cachedNdefMessage?.let { return toPayload(it, tag) }
        var message: NdefMessage? = null
        for (attempt in 1..3) {
            message = try {
                ndef.connect()
                try { ndef.ndefMessage } finally { runCatching { ndef.close() } }
            } catch (e: Exception) {
                null
            }
            if (message != null) break
            try { Thread.sleep(60L * attempt) } catch (_: InterruptedException) { break }
        }
        val resolved = message ?: ndef.cachedNdefMessage ?: return null
        return toPayload(resolved, tag)
    }

    private fun toPayload(message: NdefMessage, tag: Tag?): JSObject {
        val records = JSArray()
        var url: String? = null
        for (record in message.records) {
            if (url == null && record.tnf == NdefRecord.TNF_WELL_KNOWN &&
                record.type.contentEquals(NdefRecord.RTD_URI)) {
                url = record.toUri()?.toString()
            }
            records.put(JSObject().apply {
                put("tnf", record.tnf.toInt())
                put("type", String(record.type, Charsets.US_ASCII))
                put("payload", Base64.encodeToString(record.payload, Base64.NO_WRAP))
            })
        }
        return JSObject().apply {
            put("id", tag?.id?.joinToString("") { "%02x".format(it) })
            put("url", url)
            put("records", records)
        }
    }

    private fun performWrite(tag: Tag, pw: PendingWrite) {
        val records = mutableListOf(NdefRecord.createUri(pw.args.url))
        if (pw.args.applicationRecord != false) {
            records.add(NdefRecord.createApplicationRecord(activity.packageName))
        }
        val message = NdefMessage(records.toTypedArray())
        try {
            val ndef = Ndef.get(tag)
            var verified: Boolean? = null
            if (ndef != null) {
                ndef.connect()
                try {
                    if (!ndef.isWritable) { failWrite(pw, "notWritable"); return }
                    if (ndef.maxSize < message.toByteArray().size) { failWrite(pw, "tooLarge"); return }
                    ndef.writeNdefMessage(message)
                    if (pw.args.verify != false) verified = verify(ndef, pw.args.url)
                } finally { runCatching { ndef.close() } }
            } else {
                val formatable = NdefFormatable.get(tag)
                if (formatable == null) { failWrite(pw, "notWritable"); return }
                formatable.connect()
                try { formatable.format(message) } finally { runCatching { formatable.close() } }
                if (pw.args.verify != false) {
                    val reopened = Ndef.get(tag)
                    if (reopened != null) {
                        try { reopened.connect(); verified = verify(reopened, pw.args.url) }
                        catch (_: Exception) { verified = null }
                        finally { runCatching { reopened.close() } }
                    }
                }
            }
            if (verified == false) { failWrite(pw, "verifyMismatch"); return }
            succeedWrite(pw, JSObject().apply {
                put("verified", verified == true)
                put("id", tag.id?.joinToString("") { "%02x".format(it) })
            })
        } catch (e: IOException) {
            failWrite(pw, "tagLost")
        } catch (e: Exception) {
            failWrite(pw, "writeFailed: ${e.message}")
        }
    }

    /** true = matched, false = mismatch, null = could not re-read (inconclusive). */
    private fun verify(ndef: Ndef, expectedUrl: String): Boolean? {
        val message = try { ndef.ndefMessage } catch (_: Exception) { null } ?: return null
        val readUrl = message.records.firstOrNull { it.tnf == NdefRecord.TNF_WELL_KNOWN && it.type.contentEquals(NdefRecord.RTD_URI) }
            ?.toUri()?.toString() ?: return null
        return readUrl == expectedUrl
    }

    private fun scheduleTimeout(timeoutMs: Long?, action: () -> Unit) {
        if (timeoutMs == null || timeoutMs <= 0) return
        activity.window.decorView.postDelayed(action, timeoutMs)
    }
}
