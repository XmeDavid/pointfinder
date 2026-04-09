import SwiftUI

// MARK: - Palette (16 WCAG-safe hues, matches web-admin colorPalette.ts)

private let tagColorPalette: [String] = [
    "#3b82f6", // blue
    "#ef4444", // red
    "#22c55e", // green
    "#f59e0b", // amber
    "#a855f7", // purple
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f97316", // orange
    "#6366f1", // indigo
    "#84cc16", // lime
    "#06b6d4", // cyan
    "#e11d48", // rose
    "#8b5cf6", // violet
    "#10b981", // emerald
    "#f43f5e", // fuchsia-red
    "#0ea5e9", // sky
]

/// Pick the next palette color not already used by existing tags.
/// Falls back to a deterministic index on exhaustion.
private func nextPaletteColor(usedColors: [String]) -> String {
    let usedSet = Set(usedColors.map { $0.lowercased() })
    for color in tagColorPalette {
        if !usedSet.contains(color.lowercased()) { return color }
    }
    return tagColorPalette[usedColors.count % tagColorPalette.count]
}

/// Compute a foreground color (black or white) for a hex background using relative luminance.
private func contrastingTextColor(hex: String) -> Color {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned = String(cleaned.dropFirst()) }
    guard cleaned.count == 6, let value = UInt64(cleaned, radix: 16) else { return .white }
    let r = Double((value >> 16) & 0xFF) / 255.0
    let g = Double((value >> 8) & 0xFF) / 255.0
    let b = Double(value & 0xFF) / 255.0
    // sRGB linearize
    func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    let luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return luminance > 0.179 ? .black : .white
}

// MARK: - ManageTagsView

struct ManageTagsView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onDismiss: () -> Void

    @State private var tags: [GameTag] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    // New tag creation
    @State private var newLabel = ""
    @State private var isCreating = false
    @State private var createError: String?

    // Edit state
    @State private var editingTag: GameTag?
    @State private var editLabel = ""
    @State private var editColor = ""
    @State private var isSaving = false
    @State private var saveError: String?

    // Delete state
    @State private var tagToDelete: GameTag?
    @State private var isDeleting = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    tagListContent
                }
            }
            .navigationTitle(locale.t("tags.manageTitle"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.done")) { onDismiss() }
                }
            }
            .task { await loadTags() }
            .alert(locale.t("tags.deleteConfirmTitle"), isPresented: Binding(
                get: { tagToDelete != nil },
                set: { if !$0 { tagToDelete = nil } }
            )) {
                Button(locale.t("common.delete"), role: .destructive) {
                    if let tag = tagToDelete {
                        Task { await deleteTag(tag) }
                    }
                }
                Button(locale.t("common.cancel"), role: .cancel) { tagToDelete = nil }
            } message: {
                if let tag = tagToDelete {
                    Text(locale.t("tags.deleteConfirmMessage", tag.label))
                }
            }
        }
    }

    // MARK: - Tag list

    private var tagListContent: some View {
        List {
            // Error banner
            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Tag count header
            Section {
                Text(String(format: locale.t("tags.usageCount"), tags.count, 50))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Existing tags
            if tags.isEmpty {
                Section {
                    Text(locale.t("tags.noTagsYet"))
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                }
            } else {
                Section {
                    ForEach(tags) { tag in
                        tagRow(tag)
                    }
                }
            }

            // New tag creation row
            if tags.count < 50 {
                Section(locale.t("tags.newTagSection")) {
                    createRow
                }
            }
        }
    }

    // MARK: - Individual tag row

    @ViewBuilder
    private func tagRow(_ tag: GameTag) -> some View {
        if editingTag?.id == tag.id {
            // Edit mode
            VStack(alignment: .leading, spacing: 10) {
                TextField(locale.t("tags.labelPlaceholder"), text: $editLabel)
                    .textFieldStyle(.roundedBorder)

                // Color palette picker
                LazyVGrid(columns: Array(repeating: GridItem(.fixed(32), spacing: 6), count: 8), spacing: 6) {
                    ForEach(tagColorPalette, id: \.self) { color in
                        colorSwatch(color: color, selected: editColor.lowercased() == color.lowercased()) {
                            editColor = color
                        }
                    }
                }

                if let saveError {
                    Text(saveError)
                        .font(.caption)
                        .foregroundStyle(.red)
                }

                HStack {
                    Button(locale.t("common.cancel")) {
                        editingTag = nil
                        saveError = nil
                    }
                    .foregroundStyle(.secondary)

                    Spacer()

                    Button(locale.t("operator.save")) {
                        Task { await saveTag(tag) }
                    }
                    .disabled(editLabel.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                    .fontWeight(.semibold)
                }
            }
            .padding(.vertical, 4)
        } else {
            // View mode
            HStack(spacing: 12) {
                // Color chip
                Circle()
                    .fill(Color(hex: tag.color) ?? .blue)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color.primary.opacity(0.15), lineWidth: 1))

                Text(tag.label)
                    .font(.body)

                Spacer()

                // Edit button
                Button {
                    editingTag = tag
                    editLabel = tag.label
                    editColor = tag.color
                    saveError = nil
                } label: {
                    Image(systemName: "pencil")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)

                // Delete button
                Button {
                    tagToDelete = tag
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(.red)
                }
                .buttonStyle(.borderless)
            }
            .padding(.vertical, 2)
        }
    }

    // MARK: - Create row

    private var createRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField(locale.t("tags.newTagPlaceholder"), text: $newLabel)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.done)
                    .onSubmit { Task { await createTag() } }

                Button {
                    Task { await createTag() }
                } label: {
                    if isCreating {
                        ProgressView()
                            .frame(width: 24, height: 24)
                    } else {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.blue)
                    }
                }
                .disabled(newLabel.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
                .buttonStyle(.borderless)
            }

            if let createError {
                Text(createError)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    // MARK: - Color swatch button

    private func colorSwatch(color: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Circle()
                .fill(Color(hex: color) ?? .blue)
                .frame(width: 28, height: 28)
                .overlay(
                    Circle().stroke(selected ? Color.primary : Color.clear, lineWidth: 2)
                )
                .overlay(
                    selected ? Image(systemName: "checkmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(contrastingTextColor(hex: color))
                    : nil
                )
        }
        .buttonStyle(.borderless)
    }

    // MARK: - Network actions

    private func loadTags() async {
        guard let token else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            tags = try await appState.apiClient.listTags(gameId: game.id, token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createTag() async {
        let label = newLabel.trimmingCharacters(in: .whitespaces)
        guard !label.isEmpty, let token else { return }
        isCreating = true
        createError = nil
        defer { isCreating = false }
        let color = nextPaletteColor(usedColors: tags.map(\.color))
        do {
            let created = try await appState.apiClient.createTag(
                gameId: game.id,
                request: CreateTagRequest(label: label, color: color),
                token: token
            )
            tags.append(created)
            newLabel = ""
        } catch {
            createError = friendlyError(error, locale: locale)
        }
    }

    private func saveTag(_ tag: GameTag) async {
        let label = editLabel.trimmingCharacters(in: .whitespaces)
        guard !label.isEmpty, let token else { return }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            let updated = try await appState.apiClient.updateTag(
                gameId: game.id,
                tagId: tag.id,
                request: UpdateTagRequest(label: label, color: editColor),
                token: token
            )
            if let idx = tags.firstIndex(where: { $0.id == tag.id }) {
                tags[idx] = updated
            }
            editingTag = nil
        } catch {
            saveError = friendlyError(error, locale: locale)
        }
    }

    private func deleteTag(_ tag: GameTag) async {
        guard let token else { return }
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await appState.apiClient.deleteTag(gameId: game.id, tagId: tag.id, token: token)
            tags.removeAll { $0.id == tag.id }
        } catch {
            errorMessage = friendlyError(error, locale: locale)
        }
        tagToDelete = nil
    }

    // MARK: - Error mapping

    private func friendlyError(_ error: Error, locale: LocaleManager) -> String {
        let msg = error.localizedDescription
        if msg.contains("TAG_LABEL_DUPLICATE") || msg.contains("duplicate_label") {
            return locale.t("tags.duplicateLabelError")
        }
        if msg.contains("TAG_CAP_EXCEEDED") || msg.contains("max_per_game") {
            return String(format: locale.t("tags.atCapError"), 50)
        }
        if msg.contains("TAG_IN_USE") || msg.contains("tag_in_use") {
            return locale.t("tags.inUseError")
        }
        return msg
    }
}

// Color(hex:) is provided by SettingsView.swift's extension Color { init?(hex:) }
