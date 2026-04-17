package com.prayer.pointfinder.feature.operator

import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.viewinterop.AndroidView
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

class RichTextWebEditorState {
    var webView: WebView? = null

    fun execCommand(command: String) =
        webView?.evaluateJavascript("document.execCommand('$command', false, null)", null)

    fun execFormat(command: String, value: String) =
        webView?.evaluateJavascript("document.execCommand('$command', false, '$value')", null)

    fun insertHTML(html: String) {
        val escaped = html
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
        webView?.evaluateJavascript(
            "document.execCommand('insertHTML', false, '$escaped')", null
        )
    }

    suspend fun getHTML(): String = suspendCoroutine { cont ->
        webView?.evaluateJavascript("document.getElementById('editor').innerHTML") { result ->
            val html = try {
                org.json.JSONTokener(result).nextValue() as? String ?: ""
            } catch (_: Exception) {
                result?.trim('"') ?: ""
            }
            cont.resume(html)
        } ?: cont.resume("")
    }
}

@Composable
fun rememberRichTextWebEditorState() = remember { RichTextWebEditorState() }

/**
 * JS-to-Compose bridge that forwards `{{`-trigger events from the WebView
 * editor to the host Compose screen. The caller drives an overlay state
 * machine: `onOpen` fires on every keystroke while a partial key is being
 * typed after `{{`, and `onClose` fires when the trigger is no longer active
 * (selection moved, key closed, etc.).
 *
 * `x` and `y` are viewport pixel coordinates relative to the WebView; callers
 * should translate to Dp via `LocalDensity.current`.
 */
class VariableBridge(
    val onOpen: (partial: String, x: Float, y: Float) -> Unit,
    val onClose: () -> Unit,
) {
    @JavascriptInterface
    fun onTriggerOpen(partial: String, x: Float, y: Float) {
        onOpen(partial, x, y)
    }

    @JavascriptInterface
    fun onTriggerClose() {
        onClose()
    }
}

@Composable
fun RichTextWebEditor(
    state: RichTextWebEditorState,
    initialHtml: String,
    bridge: VariableBridge? = null,
    modifier: Modifier = Modifier,
) {
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                isVerticalScrollBarEnabled = false
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                webChromeClient = WebChromeClient()
                webViewClient = WebViewClient()
                if (bridge != null) {
                    addJavascriptInterface(bridge, "VariableBridge")
                }
                state.webView = this
                loadDataWithBaseURL(
                    null,
                    editorHTML(initialHtml, isDark),
                    "text/html",
                    "UTF-8",
                    null
                )
            }
        },
        modifier = modifier,
    )
}

private fun editorHTML(content: String, isDark: Boolean): String {
    val textColor = if (isDark) "#FFFFFF" else "#000000"
    val bgColor = if (isDark) "#1C1C1E" else "#FFFFFF"
    val placeholderColor = if (isDark) "#636366" else "#C7C7CC"
    val dividerColor = if (isDark) "#48484A" else "#D1D1D6"
    val blockBg = if (isDark) "#2C2C2E" else "#F2F2F7"
    val varBg = if (isDark) "#2C5282" else "#BEE3F8"
    val varFg = if (isDark) "#BEE3F8" else "#2C5282"
    val sanitized = content
        .replace("<script", "&lt;script", ignoreCase = true)
        .replace("</script", "&lt;/script", ignoreCase = true)
        .replace("<iframe", "&lt;iframe", ignoreCase = true)
        .replace("<object", "&lt;object", ignoreCase = true)
        .replace("<embed", "&lt;embed", ignoreCase = true)
        .replace(Regex("\\bon\\w+\\s*=", RegexOption.IGNORE_CASE), "")
        .replace("`", "\\`")
    // Trigger script: watches for `{{partial` typed inside a plain text node
    // and posts viewport-space coordinates back to Compose so the overlay can
    // be anchored to the caret. `${'$'}` emits a literal `$` inside the
    // Kotlin raw-string so the JavaScript regex sees `$` as end-of-input.
    val triggerScript = """
<script>
(function() {
  var editor = document.getElementById('editor');
  editor.focus();
  editor.addEventListener('input', function(e) {
    if (!window.VariableBridge) return;
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      window.VariableBridge.onTriggerClose();
      return;
    }
    var r = sel.getRangeAt(0);
    var container = r.startContainer;
    if (container.nodeType !== Node.TEXT_NODE) {
      window.VariableBridge.onTriggerClose();
      return;
    }
    var before = container.textContent.substring(0, r.startOffset);
    var match = before.match(/\{\{([a-zA-Z0-9_]*)${'$'}/);
    if (match) {
      var rect = r.getBoundingClientRect();
      window.VariableBridge.onTriggerOpen(match[1], rect.left, rect.top + rect.height);
    } else {
      window.VariableBridge.onTriggerClose();
    }
  });
  editor.addEventListener('blur', function() {
    if (window.VariableBridge) window.VariableBridge.onTriggerClose();
  });
})();
</script>
""".trimIndent()
    return """<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
* { box-sizing: border-box; }
body { font-family: sans-serif; font-size: 17px; line-height: 1.5;
  color: $textColor; background-color: $bgColor; margin:0; padding:0; }
#editor { min-height: 300px; padding: 16px; outline: none;
  word-wrap: break-word; overflow-wrap: break-word; }
#editor:empty:before { content: 'Start typing...'; color: $placeholderColor; pointer-events: none; }
#editor h1 { font-size:1.5em; font-weight:700; margin:0.5em 0 0.25em; }
#editor h2 { font-size:1.3em; font-weight:600; margin:0.5em 0 0.25em; }
#editor p { margin:0.5em 0; }
#editor ul, #editor ol { margin:0.5em 0; padding-left:1.5em; }
#editor li { margin:0.25em 0; }
#editor hr { border:none; border-top:1px solid $dividerColor; margin:1em 0; }
#editor blockquote { margin:0.5em 0; padding:0.5em 1em;
  border-left:4px solid $dividerColor; background:$blockBg; }
#editor code { font-family:monospace; font-size:0.9em;
  padding:0.15em 0.3em; background:$blockBg; border-radius:4px; }
#editor img { max-width:100%; height:auto; border-radius:8px; }
#editor audio { width:100%; margin:0.5em 0; border-radius:8px; }
.variable-tag { display:inline-block; background:$varBg; color:$varFg;
  padding:2px 6px; border-radius:4px; font-size:0.85em; font-weight:500; }
</style></head>
<body><div id="editor" contenteditable="true">$sanitized</div>
$triggerScript
</body></html>"""
}
