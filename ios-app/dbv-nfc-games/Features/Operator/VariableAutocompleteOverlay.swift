import SwiftUI

/// Native SwiftUI overlay that anchors near the WKWebView caret and presents
/// autocomplete suggestions for `{{`-triggered variable insertion.
struct VariableAutocompleteOverlay: View {
    let partial: String
    let position: CGPoint
    let availableKeys: [String]
    let onSelect: (String) -> Void
    let onCreate: (String) -> Void
    let onDismiss: () -> Void

    private var filtered: [String] {
        let needle = partial.lowercased()
        if needle.isEmpty {
            return availableKeys
        }
        return availableKeys.filter { $0.lowercased().contains(needle) }
    }

    private var hasExactMatch: Bool {
        availableKeys.contains { $0.caseInsensitiveCompare(partial) == .orderedSame }
    }

    private var showsCreate: Bool {
        !partial.isEmpty && !hasExactMatch
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(filtered.prefix(8)), id: \.self) { key in
                Button {
                    onSelect(key)
                } label: {
                    HStack {
                        Text("{{\(key)}}")
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(Color.primary)
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("variable-suggestion-\(key)")
                Divider()
            }
            if showsCreate {
                Button {
                    onCreate(partial)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                            .font(.caption)
                        Text("Create variable ")
                            .font(.caption)
                        Text("{{\(partial)}}")
                            .font(.system(.caption, design: .monospaced))
                        Spacer()
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("variable-suggestion-create")
            }
            if filtered.isEmpty && !showsCreate {
                Text("No matches")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
        }
        .frame(minWidth: 200, maxWidth: 260, alignment: .leading)
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .shadow(radius: 8)
        .position(x: position.x + 100, y: position.y + 40)
        .accessibilityIdentifier("variable-autocomplete-overlay")
    }
}
