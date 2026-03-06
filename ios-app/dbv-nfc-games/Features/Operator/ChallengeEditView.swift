import SwiftUI

struct ChallengeEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let challenge: Challenge
    let bases: [Base]
    let assignments: [Assignment]
    var onSaved: (Challenge) -> Void
    var onDeleted: () -> Void

    @State private var title: String
    @State private var points: Int
    @State private var pointsText: String
    @State private var descriptionHtml: String
    @State private var contentHtml: String
    @State private var completionContentHtml: String
    @State private var answerType: String
    @State private var autoValidate: Bool
    @State private var correctAnswers: [String]
    @State private var fixedBaseId: UUID?
    @State private var locationBound: Bool
    @State private var unlocksBaseId: UUID?
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var errorMessage: String?
    @State private var editingField: EditableField?
    @State private var showAddAnswerAlert = false
    @State private var newAnswerText = ""

    enum EditableField: Identifiable {
        case description, content, completionContent
        var id: Self { self }
    }

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    init(game: Game, challenge: Challenge, bases: [Base], assignments: [Assignment], onSaved: @escaping (Challenge) -> Void, onDeleted: @escaping () -> Void) {
        self.game = game
        self.challenge = challenge
        self.bases = bases
        self.assignments = assignments
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        self._title = State(initialValue: challenge.title)
        self._points = State(initialValue: challenge.points)
        self._pointsText = State(initialValue: String(challenge.points))
        self._descriptionHtml = State(initialValue: challenge.description)
        self._contentHtml = State(initialValue: challenge.content)
        self._completionContentHtml = State(initialValue: challenge.completionContent ?? "")
        self._answerType = State(initialValue: challenge.answerType)
        self._autoValidate = State(initialValue: challenge.autoValidate)
        self._correctAnswers = State(initialValue: challenge.correctAnswer ?? [])
        // fixedBaseId comes from assignments where challengeId matches and teamId is nil
        let globalAssignment = assignments.first(where: { $0.challengeId == challenge.id && $0.teamId == nil })
        self._fixedBaseId = State(initialValue: globalAssignment?.baseId)
        self._locationBound = State(initialValue: challenge.locationBound)
        self._unlocksBaseId = State(initialValue: challenge.unlocksBaseId)
    }

    var body: some View {
        Form {
            // Title & Points
            Section {
                TextField(locale.t("operator.challengeTitle"), text: $title)
                HStack {
                    Text(locale.t("operator.challengePoints"))
                    Spacer()
                    TextField("", text: $pointsText)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                        .onChange(of: pointsText) { _, newValue in
                            points = Int(newValue) ?? 0
                        }
                }
            }

            // Content
            Section(locale.t("operator.content")) {
                htmlEditorRow(
                    label: locale.t("operator.description"),
                    html: descriptionHtml,
                    field: .description
                )
                htmlEditorRow(
                    label: locale.t("operator.content"),
                    html: contentHtml,
                    field: .content
                )
                htmlEditorRow(
                    label: locale.t("operator.completionMessage"),
                    html: completionContentHtml,
                    field: .completionContent
                )
            }

            // Answer
            Section(locale.t("operator.answerType")) {
                Picker(locale.t("operator.answerType"), selection: $answerType) {
                    Text(locale.t("operator.textInput")).tag("text")
                    Text(locale.t("operator.fileUpload")).tag("file")
                }
                .pickerStyle(.segmented)

                if answerType == "text" {
                    Toggle(locale.t("operator.autoValidate"), isOn: $autoValidate)

                    if autoValidate {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(locale.t("operator.correctAnswers"))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            FlowLayout(spacing: 6) {
                                ForEach(correctAnswers, id: \.self) { answer in
                                    HStack(spacing: 4) {
                                        Text(answer)
                                            .font(.subheadline)
                                        Button {
                                            correctAnswers.removeAll { $0 == answer }
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color(.systemGray5))
                                    .clipShape(Capsule())
                                }
                            }

                            Button {
                                newAnswerText = ""
                                showAddAnswerAlert = true
                            } label: {
                                Label(locale.t("operator.addAnswer"), systemImage: "plus.circle")
                                    .font(.subheadline)
                            }
                        }
                    }
                }
            }

            // Linking
            Section(locale.t("operator.linking")) {
                Picker(locale.t("operator.fixedToBase"), selection: $fixedBaseId) {
                    Text(locale.t("operator.none")).tag(nil as UUID?)
                    ForEach(bases) { base in
                        Text(base.name).tag(base.id as UUID?)
                    }
                }
                .pickerStyle(.menu)

                Toggle(locale.t("operator.locationBound"), isOn: $locationBound)

                Picker(locale.t("operator.unlocksBase"), selection: $unlocksBaseId) {
                    Text(locale.t("operator.none")).tag(nil as UUID?)
                    ForEach(bases) { base in
                        Text(base.name).tag(base.id as UUID?)
                    }
                }
                .pickerStyle(.menu)
            }

            // Save button
            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : locale.t("operator.save"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(title.isEmpty || isSaving)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Delete
            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label(locale.t("operator.deleteChallenge"), systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .navigationTitle(locale.t("operator.editChallenge"))
        .navigationBarTitleDisplayMode(.inline)
        .alert(locale.t("operator.deleteChallengeConfirmTitle"), isPresented: $showDeleteAlert) {
            Button(locale.t("operator.delete"), role: .destructive) {
                Task { await deleteChallenge() }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("operator.deleteChallengeConfirmMessage"))
        }
        .alert(locale.t("operator.addAnswer"), isPresented: $showAddAnswerAlert) {
            TextField(locale.t("operator.answer"), text: $newAnswerText)
            Button(locale.t("common.ok")) {
                let trimmed = newAnswerText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    correctAnswers.append(trimmed)
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        }
        .fullScreenCover(item: $editingField) { field in
            RichTextEditorView(
                title: titleForField(field),
                initialHtml: htmlForField(field),
                onDone: { html in setHtml(field, html) }
            )
        }
    }

    // MARK: - HTML Editor Row

    @ViewBuilder
    private func htmlEditorRow(label: String, html: String, field: EditableField) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    editingField = field
                } label: {
                    Text(locale.t("operator.editContent"))
                        .font(.caption)
                }
            }
            if html.isEmpty {
                Text(locale.t("operator.noContent"))
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .italic()
            } else {
                AutoSizingHTMLView(html: html)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            editingField = field
        }
    }

    // MARK: - Field Helpers

    private func titleForField(_ field: EditableField) -> String {
        switch field {
        case .description: return locale.t("operator.description")
        case .content: return locale.t("operator.content")
        case .completionContent: return locale.t("operator.completionMessage")
        }
    }

    private func htmlForField(_ field: EditableField) -> String {
        switch field {
        case .description: return descriptionHtml
        case .content: return contentHtml
        case .completionContent: return completionContentHtml
        }
    }

    private func setHtml(_ field: EditableField, _ html: String) {
        switch field {
        case .description: descriptionHtml = html
        case .content: contentHtml = html
        case .completionContent: completionContentHtml = html
        }
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            let updatedChallenge = try await appState.apiClient.updateChallenge(
                gameId: game.id,
                challengeId: challenge.id,
                request: UpdateChallengeRequest(
                    title: title,
                    description: descriptionHtml,
                    content: contentHtml,
                    completionContent: completionContentHtml,
                    answerType: answerType,
                    autoValidate: autoValidate,
                    correctAnswer: correctAnswers,
                    points: points,
                    locationBound: locationBound,
                    fixedBaseId: fixedBaseId,
                    unlocksBaseId: unlocksBaseId
                ),
                token: token
            )
            onSaved(updatedChallenge)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteChallenge() async {
        guard let token else { return }
        do {
            try await appState.apiClient.deleteChallenge(gameId: game.id, challengeId: challenge.id, token: token)
            onDeleted()
            dismiss()
        } catch {
            appState.setError(error.localizedDescription)
        }
    }
}

// MARK: - Flow Layout

private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            guard index < result.positions.count else { break }
            let position = result.positions[index]
            subview.place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (positions: [CGPoint], size: CGSize) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x)
        }

        return (positions, CGSize(width: maxX, height: y + rowHeight))
    }
}
