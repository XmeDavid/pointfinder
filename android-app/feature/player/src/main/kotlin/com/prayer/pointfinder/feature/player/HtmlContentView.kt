package com.prayer.pointfinder.feature.player

import android.annotation.SuppressLint
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Renders TipTap HTML content using a WebView.
 * Supports headings, lists, blockquotes, code, images, bold, italic, and dark/light mode.
 * Mirrors the iOS HTMLContentView / AutoSizingHTMLView.
 *
 * Height is managed by the WebView itself (WRAP_CONTENT) rather than a JS bridge,
 * which avoids recomposition loops and image-cropping issues.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HtmlContentView(
    html: String,
    modifier: Modifier = Modifier,
) {
    val isDark = isSystemInDarkTheme()
    val wrappedHtml = remember(html, isDark) { wrapHtml(html, isDark) }

    // Track last loaded HTML to prevent reload loops.
    val lastLoadedHtml = remember { mutableListOf("") }

    AndroidView(
        modifier = modifier.fillMaxWidth(),
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                )
                settings.javaScriptEnabled = true
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                setBackgroundColor(android.graphics.Color.TRANSPARENT)

                // Let the WebView measure its own content height natively.
                // After images load, re-request layout so the parent picks up the new size.
                val mainHandler = Handler(Looper.getMainLooper())
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun onContentReady() {
                            mainHandler.post {
                                requestLayout()
                            }
                        }
                    },
                    "AndroidBridge",
                )

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean = true // Prevent link navigation

                    override fun onPageFinished(view: WebView?, url: String?) {
                        // Re-request layout once the page is loaded
                        view?.requestLayout()
                    }
                }

                lastLoadedHtml[0] = wrappedHtml
                loadDataWithBaseURL(null, wrappedHtml, "text/html", "UTF-8", null)
            }
        },
        update = { webView ->
            if (lastLoadedHtml[0] != wrappedHtml) {
                lastLoadedHtml[0] = wrappedHtml
                webView.loadDataWithBaseURL(null, wrappedHtml, "text/html", "UTF-8", null)
            }
        },
    )
}

private fun wrapHtml(content: String, isDark: Boolean): String {
    val textColor = if (isDark) "#FFFFFF" else "#000000"
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
                // Re-request native layout after images finish loading
                document.querySelectorAll('img').forEach(function(img) {
                    img.onload = function() {
                        if (window.AndroidBridge) AndroidBridge.onContentReady();
                    };
                });
            </script>
        </body>
        </html>
    """.trimIndent()
}
