import SwiftUI

struct ChallengesManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var challenges: [Challenge] = []
    @State private var bases: [Base] = []
    @State private var assignments: [Assignment] = []
    @State private var isLoading = true
    @State private var showCreateChallenge = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView(locale.t("operator.loading"))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if challenges.isEmpty {
                ContentUnavailableView(
                    locale.t("operator.noChallenges"),
                    systemImage: "questionmark.circle",
                    description: Text(locale.t("operator.noChallengesDesc"))
                )
            } else {
                List(challenges) { challenge in
                    NavigationLink(value: challenge.id) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(challenge.title)
                                    .font(.headline)
                                HStack(spacing: 6) {
                                    Text(challenge.answerType == "text" ? locale.t("operator.textInput") : locale.t("operator.fileUpload"))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if challenge.locationBound {
                                        Image(systemName: "location.fill")
                                            .font(.caption2)
                                            .foregroundStyle(.blue)
                                    }
                                }
                                Text(baseNameForChallenge(challenge))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(locale.t("operator.pts", challenge.points))
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(.orange)
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle(locale.t("operator.challenges"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showCreateChallenge = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .navigationDestination(for: UUID.self) { challengeId in
            if let challenge = challenges.first(where: { $0.id == challengeId }) {
                ChallengeEditView(
                    game: game,
                    challenge: challenge,
                    bases: bases,
                    assignments: assignments,
                    onSaved: { updatedChallenge in
                        if let index = challenges.firstIndex(where: { $0.id == updatedChallenge.id }) {
                            challenges[index] = updatedChallenge
                        }
                    },
                    onDeleted: {
                        challenges.removeAll { $0.id == challengeId }
                    }
                )
            }
        }
        .sheet(isPresented: $showCreateChallenge) {
            ChallengeCreateSheet(game: game) { newChallenge in
                challenges.append(newChallenge)
            }
        }
        .task {
            await loadData()
        }
        .refreshable {
            await loadData()
        }
    }

    private func baseNameForChallenge(_ challenge: Challenge) -> String {
        // Find assignment where teamId == nil (global assignment) for this challenge
        guard let assignment = assignments.first(where: { $0.challengeId == challenge.id && $0.teamId == nil }) else {
            return locale.t("operator.noBase")
        }
        guard let base = bases.first(where: { $0.id == assignment.baseId }) else {
            return locale.t("operator.noBase")
        }
        return base.name
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)
            let (c, b, a) = try await (challengesResult, basesResult, assignmentsResult)
            challenges = c
            bases = b
            assignments = a
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}

// MARK: - Create Challenge Sheet

private struct ChallengeCreateSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    var onCreated: (Challenge) -> Void

    @State private var title = ""
    @State private var points = 0
    @State private var pointsText = "0"
    @State private var answerType = "text"
    @State private var isCreating = false
    @State private var errorMessage: String?

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
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

                Section {
                    Picker(locale.t("operator.answerType"), selection: $answerType) {
                        Text(locale.t("operator.textInput")).tag("text")
                        Text(locale.t("operator.fileUpload")).tag("file")
                    }
                    .pickerStyle(.segmented)
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(locale.t("operator.createChallenge"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.create")) {
                        Task { await createChallenge() }
                    }
                    .disabled(title.isEmpty || isCreating)
                }
            }
        }
    }

    private func createChallenge() async {
        guard let token else { return }
        isCreating = true
        errorMessage = nil
        do {
            let challenge = try await appState.apiClient.createChallenge(
                gameId: game.id,
                request: CreateChallengeRequest(
                    title: title,
                    description: "",
                    content: "",
                    completionContent: "",
                    answerType: answerType,
                    autoValidate: false,
                    correctAnswer: [],
                    points: points,
                    locationBound: false,
                    fixedBaseId: nil,
                    unlocksBaseId: nil
                ),
                token: token
            )
            onCreated(challenge)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }
}
