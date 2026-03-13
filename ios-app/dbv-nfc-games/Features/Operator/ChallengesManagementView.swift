import SwiftUI

struct ChallengesManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onDismiss: (() -> Void)? = nil

    enum ChallengeNavDestination: Hashable {
        case edit(UUID)
        case create
    }

    @State private var challenges: [Challenge] = []
    @State private var bases: [Base] = []
    @State private var assignments: [Assignment] = []
    @State private var isLoading = true
    @State private var path = NavigationPath()

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack(path: $path) {
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
                        NavigationLink(value: ChallengeNavDestination.edit(challenge.id)) {
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
                        .accessibilityIdentifier("challenge-edit-btn")
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("operator.challenges"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onDismiss {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { onDismiss() } label: {
                            Image(systemName: "xmark")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        path.append(ChallengeNavDestination.create)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("create-challenge-btn")
                }
            }
            .navigationDestination(for: ChallengeNavDestination.self) { destination in
                switch destination {
                case .edit(let challengeId):
                    if let challenge = challenges.first(where: { $0.id == challengeId }) {
                        ChallengeEditView(
                            game: game,
                            challenge: challenge,
                            bases: bases,
                            challenges: challenges,
                            assignments: assignments,
                            onSaved: { updatedChallenge in
                                if let index = challenges.firstIndex(where: { $0.id == updatedChallenge.id }) {
                                    challenges[index] = updatedChallenge
                                }
                                Task { await loadData() }
                            },
                            onDeleted: {
                                challenges.removeAll { $0.id == challengeId }
                                path.removeLast()
                            }
                        )
                    }
                case .create:
                    ChallengeEditView(
                        game: game,
                        challenge: nil,
                        bases: bases,
                        challenges: challenges,
                        assignments: assignments,
                        onSaved: { newChallenge in
                            challenges.append(newChallenge)
                            Task { await loadData() }
                            path.removeLast()
                            path.append(ChallengeNavDestination.edit(newChallenge.id))
                        }
                    )
                }
            }
            .task {
                await loadData()
            }
            .refreshable {
                await loadData()
            }
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
