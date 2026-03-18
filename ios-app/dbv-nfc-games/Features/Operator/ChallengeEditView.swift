import SwiftUI

struct ChallengeEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let challenge: Challenge?
    let bases: [Base]
    let challenges: [Challenge]
    let assignments: [Assignment]
    var onSaved: (Challenge) -> Void
    var onDeleted: (() -> Void)?

    @State private var title: String
    @State private var points: Int
    @State private var pointsText: String
    @State private var descriptionText: String
    @State private var contentHtml: String
    @State private var completionContentHtml: String
    @State private var answerType: String
    @State private var autoValidate: Bool
    @State private var correctAnswers: [String]
    @State private var fixedBaseId: UUID?
    @State private var locationBound: Bool
    @State private var requirePresenceToSubmit: Bool
    @State private var unlocksBaseId: UUID?
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var errorMessage: String?
    @State private var showSaveSuccess = false
    @State private var editingField: EditableField?
    @State private var showAddAnswerAlert = false
    @State private var newAnswerText = ""
    @State private var gameVariables: [TeamVariable] = []
    @State private var challengeVariables: [TeamVariable] = []
    @State private var teams: [Team] = []
    @State private var areVariablesLoading = true

    private var isCreateMode: Bool { challenge == nil }

    enum EditableField: Identifiable {
        case content, completionContent
        var id: Self { self }
    }

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    /// Bases available for the fixed-to-base picker, excluding bases that already have a fixed challenge assigned.
    private var availableBases: [Base] {
        bases.filter { $0.fixedChallengeId == nil || $0.fixedChallengeId == challenge?.id }
    }

    /// Bases available for the unlocks-base picker: only hidden bases, excluding own fixed base and already-unlocked bases.
    private var availableUnlockBases: [Base] {
        let alreadyUnlockedBaseIds = Set(
            challenges
                .filter { $0.unlocksBaseId != nil && $0.id != challenge?.id }
                .compactMap { $0.unlocksBaseId }
        )
        return bases.filter { $0.hidden && $0.id != fixedBaseId && !alreadyUnlockedBaseIds.contains($0.id) }
    }

    private var availableVariableKeys: [String] {
        Array(Set(gameVariables.map(\.key) + challengeVariables.map(\.key))).sorted()
    }

    init(game: Game, challenge: Challenge?, bases: [Base], challenges: [Challenge], assignments: [Assignment], onSaved: @escaping (Challenge) -> Void, onDeleted: (() -> Void)? = nil) {
        self.game = game
        self.challenge = challenge
        self.bases = bases
        self.challenges = challenges
        self.assignments = assignments
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        self._title = State(initialValue: challenge?.title ?? "")
        self._points = State(initialValue: challenge?.points ?? 0)
        self._pointsText = State(initialValue: String(challenge?.points ?? 0))
        self._descriptionText = State(initialValue: challenge?.description ?? "")
        self._contentHtml = State(initialValue: challenge?.content ?? "")
        self._completionContentHtml = State(initialValue: challenge?.completionContent ?? "")
        self._answerType = State(initialValue: challenge?.answerType ?? "text")
        self._autoValidate = State(initialValue: challenge?.autoValidate ?? false)
        self._correctAnswers = State(initialValue: challenge?.correctAnswer ?? [])
        let fixedBase = bases.first(where: { $0.fixedChallengeId == challenge?.id })
        self._fixedBaseId = State(initialValue: fixedBase?.id)
        self._locationBound = State(initialValue: challenge?.locationBound ?? false)
        self._requirePresenceToSubmit = State(initialValue: challenge?.requirePresenceToSubmit ?? false)
        self._unlocksBaseId = State(initialValue: challenge?.unlocksBaseId)
    }

    var body: some View {
        Form {
            // Title & Points
            Section {
                TextField(locale.t("operator.challengeTitle"), text: $title)
                    .accessibilityIdentifier("challenge-title-input")
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

            // Description (plain text)
            Section(locale.t("operator.description")) {
                TextField(locale.t("operator.description"), text: $descriptionText, axis: .vertical)
                    .lineLimit(2...6)
            }

            // Content (rich text)
            Section(locale.t("operator.content")) {
                if answerType != "none" {
                    htmlEditorRow(
                        label: locale.t("operator.content"),
                        html: contentHtml,
                        field: .content
                    )
                }
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
                    Text(locale.t("operator.checkInOnly")).tag("none")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("challenge-type-select")
                .onChange(of: answerType) { _, newValue in
                    if newValue == "none" {
                        requirePresenceToSubmit = false
                    }
                }

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

            // Presence requirement (hidden when answerType is "none")
            if answerType != "none" {
                Section {
                    Toggle(locale.t("operator.requirePresence"), isOn: $requirePresenceToSubmit)
                }
            }

            // Linking
            Section(locale.t("operator.linking")) {
                Picker(locale.t("operator.fixedToBase"), selection: $fixedBaseId) {
                    Text(locale.t("operator.none")).tag(nil as UUID?)
                    ForEach(availableBases) { base in
                        Text(base.name).tag(base.id as UUID?)
                    }
                }
                .pickerStyle(.menu)

                Toggle(locale.t("operator.locationBound"), isOn: $locationBound)

                Picker(locale.t("operator.unlocksBase"), selection: $unlocksBaseId) {
                    Text(locale.t("operator.none")).tag(nil as UUID?)
                    ForEach(availableUnlockBases) { base in
                        Text(base.name).tag(base.id as UUID?)
                    }
                }
                .pickerStyle(.menu)
            }

            Section(locale.t("operator.challengeVariables")) {
                if areVariablesLoading {
                    ProgressView()
                } else {
                    TeamVariablesEditorView(
                        teams: teams,
                        initialVariables: challengeVariables,
                        onSave: saveChallengeVariables
                    )
                }
            }

            // Save button
            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : (isCreateMode ? locale.t("common.create") : locale.t("operator.save")))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(title.isEmpty || isSaving)
                .accessibilityIdentifier("challenge-save-btn")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Delete (edit mode only)
            if !isCreateMode {
                Section {
                    Button(role: .destructive) {
                        showDeleteAlert = true
                    } label: {
                        Label(locale.t("operator.deleteChallenge"), systemImage: "trash")
                            .frame(maxWidth: .infinity)
                    }
                    .accessibilityIdentifier("challenge-delete-btn")
                }
            }
        }
        .overlay(alignment: .top) {
            if showSaveSuccess {
                Text(locale.t("common.saved"))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.green.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation { showSaveSuccess = false }
                        }
                    }
                    .padding(.top, 8)
            }
        }
        .animation(.easeInOut, value: showSaveSuccess)
        .navigationTitle(isCreateMode ? locale.t("operator.createChallenge") : locale.t("operator.editChallenge"))
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
                onDone: { html in setHtml(field, html) },
                variables: availableVariableKeys.isEmpty ? nil : availableVariableKeys,
                teams: teams.isEmpty ? nil : teams,
                onCreateVariable: teams.isEmpty ? nil : { name in
                    await createVariable(name)
                },
                resolvePreviewHTML: { team, html in
                    resolveVariablePreview(
                        template: html,
                        gameVariables: gameVariables,
                        challengeVariables: challengeVariables,
                        teamId: team.id.uuidString.lowercased()
                    )
                }
            )
        }
        .task {
            await loadVariablesAndTeams()
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
        case .content: return locale.t("operator.content")
        case .completionContent: return locale.t("operator.completionMessage")
        }
    }

    private func htmlForField(_ field: EditableField) -> String {
        switch field {
        case .content: return contentHtml
        case .completionContent: return completionContentHtml
        }
    }

    private func setHtml(_ field: EditableField, _ html: String) {
        switch field {
        case .content: contentHtml = html
        case .completionContent: completionContentHtml = html
        }
    }

    // MARK: - Data Loading

    private func loadVariablesAndTeams() async {
        guard let token else { return }
        do {
            if let challenge {
                async let gameVariablesResult = appState.apiClient.getGameVariables(gameId: game.id, token: token)
                async let challengeVariablesResult = appState.apiClient.getChallengeVariables(gameId: game.id, challengeId: challenge.id, token: token)
                async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
                let (gameResponse, challengeResponse, fetchedTeams) = try await (gameVariablesResult, challengeVariablesResult, teamsResult)
                teams = fetchedTeams
                gameVariables = normalizedTeamVariables(gameResponse.variables, teams: fetchedTeams)
                challengeVariables = normalizedTeamVariables(challengeResponse.variables, teams: fetchedTeams)
            } else {
                async let gameVariablesResult = appState.apiClient.getGameVariables(gameId: game.id, token: token)
                async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
                let (gameResponse, fetchedTeams) = try await (gameVariablesResult, teamsResult)
                teams = fetchedTeams
                gameVariables = normalizedTeamVariables(gameResponse.variables, teams: fetchedTeams)
            }
        } catch {
            appState.setError(error.localizedDescription)
        }
        areVariablesLoading = false
    }

    private func createVariable(_ name: String) async -> String? {
        guard let token else { return APIError.authExpired.localizedDescription }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)

        guard teamVariableKeyIsValid(trimmed) else {
            return locale.t("operator.invalidVariableName")
        }

        guard !challengeVariables.contains(where: { $0.key.caseInsensitiveCompare(trimmed) == .orderedSame }) else {
            return locale.t("operator.duplicateVariable")
        }

        guard let challenge else {
            // Create mode: just add locally
            let teamValues = Dictionary(uniqueKeysWithValues: teams.map { ($0.id.uuidString.lowercased(), "") })
            challengeVariables.append(TeamVariable(key: trimmed, teamValues: teamValues))
            return nil
        }

        let teamValues = Dictionary(uniqueKeysWithValues: teams.map { ($0.id.uuidString, "") })
        let updatedVariables = challengeVariables + [TeamVariable(key: trimmed, teamValues: teamValues)]

        do {
            let response = try await appState.apiClient.saveChallengeVariables(
                gameId: game.id,
                challengeId: challenge.id,
                request: TeamVariablesRequest(variables: normalizedTeamVariables(updatedVariables, teams: teams)),
                token: token
            )
            challengeVariables = normalizedTeamVariables(response.variables, teams: teams)
            errorMessage = nil
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    private func saveChallengeVariables(_ updatedVariables: [TeamVariable]) async throws -> [TeamVariable] {
        guard let token else { throw APIError.authExpired }
        guard let challenge else {
            // Create mode: just update locally
            await MainActor.run {
                challengeVariables = updatedVariables
            }
            return updatedVariables
        }
        let response = try await appState.apiClient.saveChallengeVariables(
            gameId: game.id,
            challengeId: challenge.id,
            request: TeamVariablesRequest(variables: normalizedTeamVariables(updatedVariables, teams: teams)),
            token: token
        )
        let normalized = normalizedTeamVariables(response.variables, teams: teams)
        await MainActor.run {
            challengeVariables = normalized
            errorMessage = nil
        }
        return normalized
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            if let challenge {
                // Update existing
                let updatedChallenge = try await appState.apiClient.updateChallenge(
                    gameId: game.id,
                    challengeId: challenge.id,
                    request: UpdateChallengeRequest(
                        title: title,
                        description: descriptionText,
                        content: contentHtml,
                        completionContent: completionContentHtml,
                        answerType: answerType,
                        autoValidate: autoValidate,
                        correctAnswer: correctAnswers,
                        points: points,
                        locationBound: locationBound,
                        fixedBaseId: fixedBaseId,
                        unlocksBaseId: unlocksBaseId,
                        requirePresenceToSubmit: requirePresenceToSubmit
                    ),
                    token: token
                )
                onSaved(updatedChallenge)
                withAnimation { showSaveSuccess = true }
            } else {
                // Create new
                let newChallenge = try await appState.apiClient.createChallenge(
                    gameId: game.id,
                    request: CreateChallengeRequest(
                        title: title,
                        description: descriptionText,
                        content: contentHtml,
                        completionContent: completionContentHtml,
                        answerType: answerType,
                        autoValidate: autoValidate,
                        correctAnswer: correctAnswers,
                        points: points,
                        locationBound: locationBound,
                        fixedBaseId: fixedBaseId,
                        unlocksBaseId: unlocksBaseId,
                        requirePresenceToSubmit: requirePresenceToSubmit
                    ),
                    token: token
                )
                withAnimation { showSaveSuccess = true }
                onSaved(newChallenge)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteChallenge() async {
        guard let token, let challenge else { return }
        do {
            try await appState.apiClient.deleteChallenge(gameId: game.id, challengeId: challenge.id, token: token)
            onDeleted?()
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
