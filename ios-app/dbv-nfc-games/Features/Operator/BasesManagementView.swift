import SwiftUI

struct BasesManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onDismiss: (() -> Void)? = nil

    enum BaseNavDestination: Hashable {
        case edit(UUID)
        case create
    }

    @State private var bases: [Base] = []
    @State private var challenges: [Challenge] = []
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
            content
        }
    }

    private var content: some View {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if bases.isEmpty {
                    ContentUnavailableView(
                        locale.t("operator.noBases"),
                        systemImage: "mappin.slash",
                        description: Text(locale.t("operator.noBasesDesc"))
                    )
                } else {
                    List(bases) { base in
                        NavigationLink(value: BaseNavDestination.edit(base.id)) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(base.name)
                                        .font(.headline)
                                    if !base.description.isEmpty {
                                        Text(base.description)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    Text(challengeInfoForBase(base))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(base.nfcLinked ? locale.t("operator.linked") : locale.t("operator.notLinked"))
                                    .font(.caption2)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(base.nfcLinked ? Color.green.opacity(0.2) : Color.orange.opacity(0.2))
                                    .foregroundStyle(base.nfcLinked ? .green : .orange)
                                    .clipShape(Capsule())
                                if base.hidden {
                                    Image(systemName: "eye.slash")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .accessibilityIdentifier("base-edit-btn")
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("operator.bases"))
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
                        path.append(BaseNavDestination.create)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("create-base-btn")
                }
            }
            .navigationDestination(for: BaseNavDestination.self) { destination in
                switch destination {
                case .edit(let baseId):
                    if let base = bases.first(where: { $0.id == baseId }) {
                        BaseEditView(
                            game: game,
                            base: base,
                            bases: bases,
                            challenges: challenges,
                            onSaved: { updatedBase in
                                if let index = bases.firstIndex(where: { $0.id == updatedBase.id }) {
                                    bases[index] = updatedBase
                                }
                                Task { await loadData() }
                            },
                            onDeleted: {
                                bases.removeAll { $0.id == baseId }
                                path.removeLast()
                            }
                        )
                    }
                case .create:
                    BaseEditView(
                        game: game,
                        base: nil,
                        bases: bases,
                        challenges: challenges,
                        onSaved: { newBase in
                            bases.append(newBase)
                            Task { await loadData() }
                            path.removeLast()
                            path.append(BaseNavDestination.edit(newBase.id))
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
            .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
                guard let rawGameId = notification.userInfo?["gameId"] as? String,
                      rawGameId.lowercased() == game.id.uuidString.lowercased(),
                      let type = notification.userInfo?["type"] as? String,
                      type == "game_config",
                      let data = notification.userInfo?["data"] as? [String: Any],
                      let entity = data["entity"] as? String,
                      entity == "bases" else { return }
                Task { await loadData() }
            }
    }

    private func challengeInfoForBase(_ base: Base) -> String {
        let baseAssignments = assignments.filter { $0.baseId == base.id }
        let perTeamCount = baseAssignments.filter { $0.teamId != nil }.count
        let globalAssignment = baseAssignments.first(where: { $0.teamId == nil })

        if perTeamCount >= 2 || (perTeamCount == 1 && globalAssignment == nil) {
            return locale.t("operator.customAssignment")
        }
        if let global = globalAssignment,
           let challenge = challenges.first(where: { $0.id == global.challengeId }) {
            return challenge.title
        }
        if let fixedId = base.fixedChallengeId,
           let challenge = challenges.first(where: { $0.id == fixedId }) {
            return challenge.title
        }
        return locale.t("operator.noChallenge")
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)
            let (b, c, a) = try await (basesResult, challengesResult, assignmentsResult)
            bases = b
            challenges = c
            assignments = a
        } catch is CancellationError {
            // Task cancelled during navigation — not an error
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
