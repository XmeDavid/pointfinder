import SwiftUI

/// Sheet that collects a single `correctAnswer` chip with `{{`-trigger
/// variable autocomplete. A chip may be a literal string, a `{{key}}`
/// reference, or a mix like `"{{prefix}}-FOX"`.
struct AddCorrectAnswerSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let availableKeys: [String]
    let onCreateVariable: ((String) -> Void)?
    let onAdd: (String) -> Void

    @State private var text: String = ""
    @FocusState private var fieldFocused: Bool

    /// When the caret sits at `..{{partial` we surface suggestions for `partial`.
    private var triggerPartial: String? {
        let prefix = text
        guard let openRange = prefix.range(of: "{{", options: .backwards) else { return nil }
        let after = prefix[openRange.upperBound...]
        // A trailing `}}` means the user already closed the ref; no overlay.
        if after.contains("}") { return nil }
        // Only show for valid partial identifier chars.
        let isValid = after.allSatisfy { $0.isLetter || $0.isNumber || $0 == "_" }
        return isValid ? String(after) : nil
    }

    private var filtered: [String] {
        guard let partial = triggerPartial else { return [] }
        let needle = partial.lowercased()
        if needle.isEmpty {
            return availableKeys
        }
        return availableKeys.filter { $0.lowercased().contains(needle) }
    }

    private var hasExactMatch: Bool {
        guard let partial = triggerPartial, !partial.isEmpty else { return false }
        return availableKeys.contains { $0.caseInsensitiveCompare(partial) == .orderedSame }
    }

    private var showsCreate: Bool {
        guard let partial = triggerPartial, !partial.isEmpty else { return false }
        return !hasExactMatch && onCreateVariable != nil
    }

    private var showsOverlay: Bool {
        triggerPartial != nil && (!filtered.isEmpty || showsCreate)
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(locale.t("operator.addAnswer"))
                    .font(.headline)
                TextField(locale.t("common.answer"), text: $text)
                    .textFieldStyle(.roundedBorder)
                    .focused($fieldFocused)
                    .accessibilityIdentifier("add-correct-answer-field")

                if showsOverlay {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(filtered.prefix(6)), id: \.self) { key in
                            Button {
                                insertVariable(key)
                            } label: {
                                HStack {
                                    Text("{{\(key)}}")
                                        .font(.system(.caption, design: .monospaced))
                                        .foregroundStyle(Color.primary)
                                    Spacer()
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("add-answer-suggestion-\(key)")
                            Divider()
                        }
                        if showsCreate, let partial = triggerPartial {
                            Button {
                                onCreateVariable?(partial)
                                dismiss()
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "plus")
                                        .font(.caption)
                                    Text(locale.t("operator.autocomplete.createVariable"))
                                        .font(.caption)
                                    Text("{{\(partial)}}")
                                        .font(.system(.caption, design: .monospaced))
                                    Spacer()
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("add-answer-suggestion-create")
                        }
                    }
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                Spacer()
            }
            .padding()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.ok")) {
                        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            onAdd(trimmed)
                            dismiss()
                        }
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("add-correct-answer-confirm")
                }
            }
            .onAppear { fieldFocused = true }
        }
    }

    /// Replaces the `{{partial` fragment at the end of `text` with `{{key}} `.
    private func insertVariable(_ key: String) {
        guard let openRange = text.range(of: "{{", options: .backwards) else { return }
        let head = text[..<openRange.lowerBound]
        text = head + "{{" + key + "}} "
    }
}
