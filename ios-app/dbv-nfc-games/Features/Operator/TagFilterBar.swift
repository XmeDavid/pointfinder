import SwiftUI

// MARK: - WCAG contrast helper (shared by TagFilterBar and ManageTagsView)

/// Returns .black or .white depending on WCAG relative luminance of the hex color.
func tagContrastingTextColor(hex: String) -> Color {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned = String(cleaned.dropFirst()) }
    guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else { return .white }
    let r = Double((value >> 16) & 0xFF) / 255.0
    let g = Double((value >> 8) & 0xFF) / 255.0
    let b = Double(value & 0xFF) / 255.0
    func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    let luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return luminance > 0.179 ? .black : .white
}

// MARK: - TagFilterBar

/// Horizontal scrollable row of tag filter chips.
/// AND semantics: items must carry ALL selected tags to pass the filter.
/// Bind `selectedTagIds` from the parent screen's @State.
struct TagFilterBar: View {
    let tags: [GameTag]
    @Binding var selectedTagIds: Set<UUID>
    let clearLabel: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(tags) { tag in
                    let isSelected = selectedTagIds.contains(tag.id)
                    let bgColor = Color(hex: tag.color) ?? .blue
                    let textColor = isSelected ? tagContrastingTextColor(hex: tag.color) : Color.primary

                    Button {
                        if isSelected {
                            selectedTagIds.remove(tag.id)
                        } else {
                            selectedTagIds.insert(tag.id)
                        }
                    } label: {
                        Text(tag.label)
                            .font(.caption)
                            .fontWeight(.medium)
                            .foregroundStyle(textColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(isSelected ? bgColor : Color(.systemBackground))
                            .clipShape(Capsule())
                            .overlay(
                                Capsule()
                                    .strokeBorder(isSelected ? bgColor : Color(.systemGray4), lineWidth: 1)
                            )
                    }
                    .accessibilityIdentifier("filter-tag-\(tag.id.uuidString.lowercased())")
                    .accessibilityAddTraits(isSelected ? [.isSelected] : [])
                }

                if !selectedTagIds.isEmpty {
                    Button {
                        selectedTagIds.removeAll()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark")
                                .font(.caption2)
                            Text(clearLabel)
                                .font(.caption)
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                    }
                    .accessibilityIdentifier("filter-clear")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(.secondarySystemBackground).opacity(0.6))
    }
}
