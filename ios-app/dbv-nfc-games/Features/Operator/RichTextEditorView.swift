import SwiftUI
import UniformTypeIdentifiers
import WebKit

// MARK: - Rich Text Editor View

struct RichTextEditorView: View {
    let title: String
    let initialHtml: String
    let onDone: (String) -> Void

    // Optional variable support
    var variables: [String]?
    var teams: [Team]?
    var onCreateVariable: ((String) async -> String?)?
    var resolvePreviewHTML: ((Team, String) -> String)?

    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    @State private var webViewCoordinator = RichTextWebViewCoordinator()
    @State private var showVariablePicker = false
    @State private var showCreateVariable = false
    @State private var showAudioFilePicker = false
    @State private var showAudioSizeError = false
    @State private var showPreviewTeamPicker = false
    @State private var newVariableName = ""
    @State private var previewTeam: Team?
    @State private var previewHtml = ""
    @State private var createVariableErrorMessage: String?

    private var hasOverflowMenu: Bool {
        variables != nil || onCreateVariable != nil || (teams != nil && !(teams?.isEmpty ?? true))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Formatting toolbar
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        FormatButton(label: "B", fontWeight: .bold) {
                            webViewCoordinator.execCommand("bold")
                        }
                        FormatButton(label: "I", italic: true) {
                            webViewCoordinator.execCommand("italic")
                        }
                        FormatButton(label: "U", underline: true) {
                            webViewCoordinator.execCommand("underline")
                        }

                        Divider().frame(height: 24)

                        FormatButton(icon: "list.bullet") {
                            webViewCoordinator.execCommand("insertUnorderedList")
                        }
                        FormatButton(icon: "list.number") {
                            webViewCoordinator.execCommand("insertOrderedList")
                        }

                        Divider().frame(height: 24)

                        FormatButton(label: "H1") {
                            webViewCoordinator.execFormat("formatBlock", value: "h1")
                        }
                        FormatButton(label: "H2") {
                            webViewCoordinator.execFormat("formatBlock", value: "h2")
                        }
                        FormatButton(label: "\u{00B6}") {
                            webViewCoordinator.execFormat("formatBlock", value: "p")
                        }

                        Divider().frame(height: 24)

                        FormatButton(icon: "minus") {
                            webViewCoordinator.execCommand("insertHorizontalRule")
                        }

                        Divider().frame(height: 24)

                        FormatButton(icon: "music.note") { showAudioFilePicker = true }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                }
                .background(Color(.systemGray6))

                // Editor WebView
                RichTextWebView(
                    coordinator: webViewCoordinator,
                    initialHtml: initialHtml,
                    isDark: colorScheme == .dark
                )

                if let createVariableErrorMessage {
                    Text(createVariableErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                if hasOverflowMenu {
                    ToolbarItem(placement: .primaryAction) {
                        Menu {
                            if variables != nil {
                                Button {
                                    showVariablePicker = true
                                } label: {
                                    Label(locale.t("operator.insertVariable"), systemImage: "curlybraces")
                                }
                            }
                            if onCreateVariable != nil {
                                Button {
                                    newVariableName = ""
                                    showCreateVariable = true
                                } label: {
                                    Label(locale.t("operator.createVariable"), systemImage: "plus.circle")
                                }
                            }
                            if let teams, !teams.isEmpty {
                                Button {
                                    showPreviewTeamPicker = true
                                } label: {
                                    Label(locale.t("operator.previewAsTeam"), systemImage: "eye")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) {
                        webViewCoordinator.getHTML { html in
                            onDone(html)
                            dismiss()
                        }
                    }
                }
            }
            .sheet(isPresented: $showVariablePicker) {
                VariablePickerSheet(
                    variables: variables ?? [],
                    onSelect: { key in
                        let tag = "<span class=\"variable-tag\">{{\(key)}}</span>&nbsp;"
                        webViewCoordinator.insertHTML(tag)
                        showVariablePicker = false
                    }
                )
                .presentationDetents([.medium])
            }
            .alert(locale.t("operator.createVariable"), isPresented: $showCreateVariable) {
                TextField(locale.t("operator.variableName"), text: $newVariableName)
                Button(locale.t("common.ok")) {
                    let trimmed = newVariableName.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty, let onCreateVariable {
                        Task {
                            createVariableErrorMessage = nil
                            if let errorMessage = await onCreateVariable(trimmed) {
                                createVariableErrorMessage = errorMessage
                            } else {
                                let tag = "<span class=\"variable-tag\">{{\(trimmed)}}</span>&nbsp;"
                                webViewCoordinator.insertHTML(tag)
                            }
                        }
                    }
                }
                Button(locale.t("common.cancel"), role: .cancel) {}
            }
            .sheet(isPresented: $showPreviewTeamPicker) {
                PreviewTeamPickerSheet(
                    teams: teams ?? [],
                    onSelect: { team in
                        webViewCoordinator.getHTML { html in
                            previewHtml = resolvePreviewHTML?(team, html) ?? html
                            previewTeam = team
                            showPreviewTeamPicker = false
                        }
                    }
                )
                .presentationDetents([.medium])
            }
            .sheet(item: $previewTeam) { team in
                ResolvedPreviewSheet(team: team, html: previewHtml)
            }
            .fileImporter(isPresented: $showAudioFilePicker, allowedContentTypes: [.audio]) { result in
                guard let url = try? result.get() else { return }
                guard url.startAccessingSecurityScopedResource() else { return }
                defer { url.stopAccessingSecurityScopedResource() }
                guard let data = try? Data(contentsOf: url) else { return }
                guard data.count <= 5_000_000 else {
                    showAudioSizeError = true
                    return
                }
                let ext = url.pathExtension.lowercased()
                let mime: String
                switch ext {
                case "mp3": mime = "audio/mpeg"
                case "aac": mime = "audio/aac"
                case "ogg": mime = "audio/ogg"
                case "wav": mime = "audio/wav"
                case "m4a": mime = "audio/mp4"
                default: mime = "audio/\(ext)"
                }
                let b64 = data.base64EncodedString()
                let html = "<audio controls style=\"width:100%;margin:0.5em 0\" src=\"data:\(mime);base64,\(b64)\"></audio>"
                webViewCoordinator.insertHTML(html)
            }
            .alert("File Too Large", isPresented: $showAudioSizeError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("Audio file must be under 5 MB")
            }
        }
    }
}

// MARK: - Variable Picker Sheet

private struct VariablePickerSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let variables: [String]
    let onSelect: (String) -> Void

    var body: some View {
        NavigationStack {
            List(variables, id: \.self) { key in
                Button {
                    onSelect(key)
                } label: {
                    HStack {
                        Text(key)
                        Spacer()
                        Text("{{\(key)}}")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fontDesign(.monospaced)
                    }
                }
            }
            .navigationTitle(locale.t("operator.insertVariable"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
            }
        }
    }
}

// MARK: - Preview Team Picker Sheet

private struct PreviewTeamPickerSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let teams: [Team]
    let onSelect: (Team) -> Void

    var body: some View {
        NavigationStack {
            List(teams) { team in
                Button {
                    onSelect(team)
                } label: {
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color(hex: team.color) ?? .blue)
                            .frame(width: 24, height: 24)
                        Text(team.name)
                    }
                }
            }
            .navigationTitle(locale.t("operator.previewAsTeam"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
            }
        }
    }
}

// MARK: - Resolved Preview Sheet

private struct ResolvedPreviewSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let team: Team
    let html: String

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 10) {
                        Circle()
                            .fill(Color(hex: team.color) ?? .blue)
                            .frame(width: 14, height: 14)
                        Text(team.name)
                            .font(.headline)
                    }

                    if html.isEmpty {
                        Text(locale.t("operator.noContent"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        AutoSizingHTMLView(html: html)
                    }
                }
                .padding()
            }
            .navigationTitle(locale.t("operator.previewAsTeam"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Format Button

private struct FormatButton: View {
    var label: String?
    var icon: String?
    var fontWeight: Font.Weight = .regular
    var italic: Bool = false
    var underline: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 15))
                } else if let label {
                    Text(label)
                        .font(.system(size: 15, weight: fontWeight))
                        .italic(italic)
                        .underline(underline)
                }
            }
            .frame(width: 36, height: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - WebView Coordinator (JS Bridge)

@Observable
class RichTextWebViewCoordinator {
    var webView: WKWebView?
    private var htmlCallback: ((String) -> Void)?

    private func jsEscape(_ str: String) -> String {
        str.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
    }

    func execCommand(_ command: String) {
        webView?.evaluateJavaScript("document.execCommand('\(jsEscape(command))', false, null)")
    }

    func execFormat(_ command: String, value: String) {
        webView?.evaluateJavaScript("document.execCommand('\(jsEscape(command))', false, '\(jsEscape(value))')")
    }

    func insertHTML(_ html: String) {
        webView?.evaluateJavaScript("document.execCommand('insertHTML', false, '\(jsEscape(html))')")
    }

    func getHTML(completion: @escaping (String) -> Void) {
        htmlCallback = completion
        webView?.evaluateJavaScript("document.getElementById('editor').innerHTML") { [weak self] result, _ in
            let html = result as? String ?? ""
            self?.htmlCallback?(html)
            self?.htmlCallback = nil
        }
    }
}

// MARK: - WKWebView Representable

private struct RichTextWebView: UIViewRepresentable {
    let coordinator: RichTextWebViewCoordinator
    let initialHtml: String
    let isDark: Bool

    func makeCoordinator() -> WebViewDelegate {
        WebViewDelegate()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.navigationDelegate = context.coordinator
        coordinator.webView = webView

        let htmlContent = editorHTML(content: initialHtml, isDark: isDark)
        webView.loadHTMLString(htmlContent, baseURL: nil)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Only reload if dark mode changed
    }

    private func editorHTML(content: String, isDark: Bool) -> String {
        let textColor = isDark ? "#FFFFFF" : "#000000"
        let bgColor = isDark ? "#1C1C1E" : "#FFFFFF"
        let placeholderColor = isDark ? "#636366" : "#C7C7CC"
        let sanitized = content.replacingOccurrences(of: "<script", with: "&lt;script", options: .caseInsensitive)
            .replacingOccurrences(of: "</script", with: "&lt;/script", options: .caseInsensitive)
        let escaped = sanitized.replacingOccurrences(of: "`", with: "\\`")

        return """
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <style>
                * { box-sizing: border-box; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
                    font-size: 17px;
                    line-height: 1.5;
                    color: \(textColor);
                    background-color: \(bgColor);
                    margin: 0;
                    padding: 0;
                    -webkit-text-size-adjust: 100%;
                }
                #editor {
                    min-height: 300px;
                    padding: 16px;
                    outline: none;
                    word-wrap: break-word;
                    overflow-wrap: break-word;
                }
                #editor:empty:before {
                    content: 'Start typing...';
                    color: \(placeholderColor);
                    pointer-events: none;
                }
                #editor h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0 0.25em; }
                #editor h2 { font-size: 1.3em; font-weight: 600; margin: 0.5em 0 0.25em; }
                #editor p { margin: 0.5em 0; }
                #editor ul, #editor ol { margin: 0.5em 0; padding-left: 1.5em; }
                #editor li { margin: 0.25em 0; }
                #editor hr { border: none; border-top: 1px solid \(isDark ? "#48484A" : "#D1D1D6"); margin: 1em 0; }
                #editor blockquote {
                    margin: 0.5em 0; padding: 0.5em 1em;
                    border-left: 4px solid \(isDark ? "#48484A" : "#D1D1D6");
                    background: \(isDark ? "#2C2C2E" : "#F2F2F7");
                }
                #editor code {
                    font-family: 'SF Mono', Menlo, monospace;
                    font-size: 0.9em;
                    padding: 0.15em 0.3em;
                    background: \(isDark ? "#2C2C2E" : "#F2F2F7");
                    border-radius: 4px;
                }
                #editor img { max-width: 100%; height: auto; border-radius: 8px; }
                .variable-tag {
                    display: inline-block;
                    background: \(isDark ? "#2C5282" : "#BEE3F8");
                    color: \(isDark ? "#BEE3F8" : "#2C5282");
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.85em;
                    font-weight: 500;
                }
            </style>
        </head>
        <body>
            <div id="editor" contenteditable="true">\(escaped)</div>
            <script>
                document.getElementById('editor').focus();
            </script>
        </body>
        </html>
        """
    }

    class WebViewDelegate: NSObject, WKNavigationDelegate {
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if navigationAction.navigationType == .linkActivated {
                decisionHandler(.cancel)
            } else {
                decisionHandler(.allow)
            }
        }
    }
}
