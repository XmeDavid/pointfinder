import SwiftUI
import WebKit

/// A SwiftUI view that renders HTML content using WKWebView.
/// Supports TipTap editor output including bold, italic, headings, lists, blockquotes, code blocks, and images.
struct HTMLContentView: UIViewRepresentable {
    let html: String
    @Environment(\.colorScheme) private var colorScheme
    
    /// Binding for dynamic height calculation
    @Binding var dynamicHeight: CGFloat
    
    init(html: String, dynamicHeight: Binding<CGFloat> = .constant(100)) {
        self.html = html
        self._dynamicHeight = dynamicHeight
    }
    
    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }
    
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // Disable data detection (links, phone numbers, etc.)
        configuration.dataDetectorTypes = []
        
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        
        // Disable user selection and link handling
        let script = WKUserScript(
            source: "document.body.style.webkitUserSelect='none'; document.body.style.webkitTouchCallout='none';",
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        webView.configuration.userContentController.addUserScript(script)
        
        return webView
    }
    
    func updateUIView(_ webView: WKWebView, context: Context) {
        let wrappedHTML = wrapHTML(html)
        webView.loadHTMLString(wrappedHTML, baseURL: nil)
    }
    
    /// Wraps the HTML content with a stylesheet that matches the app's design
    private func wrapHTML(_ content: String) -> String {
        let isDark = colorScheme == .dark
        let textColor = isDark ? "#FFFFFF" : "#000000"
        let secondaryColor = isDark ? "#8E8E93" : "#6C6C70"
        let backgroundColor = "transparent"
        let codeBackground = isDark ? "#2C2C2E" : "#F2F2F7"
        let blockquoteBackground = isDark ? "#1C1C1E" : "#F5F5F5"
        let blockquoteBorder = isDark ? "#48484A" : "#D1D1D6"
        
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
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
                    font-size: 17px;
                    line-height: 1.5;
                    color: \(textColor);
                    background-color: \(backgroundColor);
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
                    background-color: \(blockquoteBackground);
                    border-left: 4px solid \(blockquoteBorder);
                    border-radius: 4px;
                }
                
                code {
                    font-family: 'SF Mono', Menlo, monospace;
                    font-size: 0.9em;
                    padding: 0.15em 0.3em;
                    background-color: \(codeBackground);
                    border-radius: 4px;
                }
                
                pre {
                    margin: 0.5em 0;
                    padding: 0.75em;
                    background-color: \(codeBackground);
                    border-radius: 8px;
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }
                
                pre code {
                    padding: 0;
                    background: none;
                }
                
                a {
                    color: \(textColor);
                    text-decoration: underline;
                    pointer-events: none;
                }
                
                img {
                    max-width: 100%;
                    height: auto;
                    border-radius: 8px;
                    margin: 0.5em 0;
                }
                
                hr {
                    border: none;
                    border-top: 1px solid \(blockquoteBorder);
                    margin: 1em 0;
                }
                
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 0.5em 0;
                }
                
                th, td {
                    border: 1px solid \(blockquoteBorder);
                    padding: 0.5em;
                    text-align: left;
                }
                
                th {
                    background-color: \(codeBackground);
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            \(content)
            <script>
                // Notify when content is loaded
                window.onload = function() {
                    window.webkit.messageHandlers.heightUpdate.postMessage(document.body.scrollHeight);
                };
            </script>
        </body>
        </html>
        """
    }
    
    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: HTMLContentView
        
        init(_ parent: HTMLContentView) {
            self.parent = parent
            super.init()
        }
        
        // Prevent navigation to links
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated {
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }
        
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            // Calculate content height after loading
            webView.evaluateJavaScript("document.body.scrollHeight") { [weak self] height, error in
                if let height = height as? CGFloat {
                    DispatchQueue.main.async {
                        self?.parent.dynamicHeight = height
                    }
                }
            }
        }
        
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "heightUpdate", let height = message.body as? CGFloat {
                DispatchQueue.main.async {
                    self.parent.dynamicHeight = height
                }
            }
        }
    }
}

/// A simpler HTML view with automatic height sizing
struct AutoSizingHTMLView: View {
    let html: String
    @State private var height: CGFloat = 50
    
    var body: some View {
        HTMLContentView(html: html, dynamicHeight: $height)
            .frame(height: max(50, height))
    }
}

#Preview {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            Text("Preview")
                .font(.headline)
            
            AutoSizingHTMLView(html: """
                <h2>Challenge Instructions</h2>
                <p>This is a <strong>bold</strong> and <em>italic</em> text example.</p>
                <ul>
                    <li>First item</li>
                    <li>Second item</li>
                </ul>
                <blockquote>This is a blockquote with some important information.</blockquote>
                <p>Here's some <code>inline code</code> for you.</p>
                <pre><code>// Code block example
                func hello() {
                    print("Hello!")
                }</code></pre>
            """)
            .padding()
            .background(Color.gray.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .padding()
    }
}
