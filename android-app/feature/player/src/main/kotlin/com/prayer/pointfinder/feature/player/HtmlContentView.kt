package com.prayer.pointfinder.feature.player

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Renders TipTap HTML content using a WebView.
 * Supports headings, lists, blockquotes, code, images, bold, italic, and dark/light mode.
 * Mirrors the iOS HTMLContentView / AutoSizingHTMLView.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HtmlContentView(
    html: String,
    modifier: Modifier = Modifier,
) {
    val isDark = isSystemInDarkTheme()
    val density = LocalDensity.current
    var contentHeightDp by remember { mutableIntStateOf(100) }

    val wrappedHtml = remember(html, isDark) { wrapHtml(html, isDark) }

    AndroidView(
        modifier = modifier
            .heightIn(min = 50.dp)
            .then(if (contentHeightDp > 0) Modifier.height(contentHeightDp.dp) else Modifier),
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
                settings.javaScriptEnabled = true
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                setBackgroundColor(android.graphics.Color.TRANSPARENT)

                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun onHeightChanged(heightPx: Float) {
                            val dp = with(density) { heightPx.toDp().value.toInt() }
                            contentHeightDp = dp + 4 // small padding to avoid clipping
                        }
                    },
                    "AndroidBridge",
                )

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean {
                        // Prevent link navigation
                        return true
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        // Measure content height after page loads
                        view?.evaluateJavascript(
                            "AndroidBridge.onHeightChanged(document.body.scrollHeight);",
                            null,
                        )
                    }
                }

                loadDataWithBaseURL(null, wrappedHtml, "text/html", "UTF-8", null)
            }
        },
        update = { webView ->
            webView.loadDataWithBaseURL(null, wrappedHtml, "text/html", "UTF-8", null)
        },
    )
}

private fun wrapHtml(content: String, isDark: Boolean): String {
    val textColor = if (isDark) "#FFFFFF" else "#000000"
    val secondaryColor = if (isDark) "#8E8E93" else "#6C6C70"
    val codeBackground = if (isDark) "#2C2C2E" else "#F2F2F7"
    val blockquoteBackground = if (isDark) "#1C1C1E" else "#F5F5F5"
    val blockquoteBorder = if (isDark) "#48484A" else "#D1D1D6"

    return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
                * {
                    -webkit-touch-callout: none;
                    -webkit-user-select: none;
                    user-select: none;
                }

                body {
                    font-family: 'Roboto', sans-serif;
                    font-size: 16px;
                    line-height: 1.5;
                    color: $textColor;
                    background-color: transparent;
                    margin: 0;
                    padding: 0;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }

                h1, h2, h3, h4, h5, h6 {
                    font-weight: 600;
                    margin: 0.5em 0 0.25em 0;
                }

                h1 { font-size: 1.5em; }
                h2 { font-size: 1.3em; }
                h3 { font-size: 1.15em; }
                h4, h5, h6 { font-size: 1em; }

                p {
                    margin: 0.5em 0;
                }

                strong, b {
                    font-weight: 600;
                }

                em, i {
                    font-style: italic;
                }

                ul, ol {
                    margin: 0.5em 0;
                    padding-left: 1.5em;
                }

                li {
                    margin: 0.25em 0;
                }

                blockquote {
                    margin: 0.5em 0;
                    padding: 0.5em 1em;
                    background-color: $blockquoteBackground;
                    border-left: 4px solid $blockquoteBorder;
                    border-radius: 4px;
                }

                code {
                    font-family: monospace;
                    font-size: 0.9em;
                    padding: 0.15em 0.3em;
                    background-color: $codeBackground;
                    border-radius: 4px;
                }

                pre {
                    margin: 0.5em 0;
                    padding: 0.75em;
                    background-color: $codeBackground;
                    border-radius: 8px;
                    overflow-x: auto;
                }

                pre code {
                    padding: 0;
                    background: none;
                }

                a {
                    color: $textColor;
                    text-decoration: underline;
                    pointer-events: none;
                }

                img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 0.5em 0;
                    display: block;
                }

                hr {
                    border: none;
                    border-top: 1px solid $blockquoteBorder;
                    margin: 1em 0;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0.5em 0;
                }

                th, td {
                    border: 1px solid $blockquoteBorder;
                    padding: 0.5em;
                    text-align: left;
                }

                th {
                    background-color: $codeBackground;
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            $content
            <script>
                window.onload = function() {
                    AndroidBridge.onHeightChanged(document.body.scrollHeight);
                };
                // Also report height when images load
                document.querySelectorAll('img').forEach(function(img) {
                    img.onload = function() {
                        AndroidBridge.onHeightChanged(document.body.scrollHeight);
                    };
                });
            </script>
        </body>
        </html>
    """.trimIndent()
}
