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
    @State private var gameTags: [GameTag] = []
    @State private var selectedTagIds: Set<UUID> = []
    @State private var isLoading = true
    @State private var path = NavigationPath()

    private var filteredChallenges: [Challenge] {
        guard !selectedTagIds.isEmpty else { return challenges }
        return challenges.filter { ch in
            selectedTagIds.allSatisfy { tagId in ch.tagIds?.contains(tagId) == true }
        }
    }

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
            } else if challenges.isEmpty {
                ContentUnavailableView(
                    locale.t("operator.noChallenges"),
                    systemImage: "questionmark.circle",
                    description: Text(locale.t("operator.noChallengesDesc"))
                )
            } else {
                VStack(spacing: 0) {
                    if !gameTags.isEmpty {
                        TagFilterBar(
                            tags: gameTags,
                            selectedTagIds: $selectedTagIds,
                            clearLabel: locale.t("tags.clearFilters")
                        )
                        .accessibilityIdentifier("challenges-tag-filter-bar")
                    }
                    if filteredChallenges.isEmpty {
                        ContentUnavailableView(
                            locale.t("tags.noChallengesFiltered"),
                            systemImage: "line.3.horizontal.decrease.circle"
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: PFSpacing.itemGap) {
                                ForEach(filteredChallenges) { challenge in
                                    Button {
                                        path.append(ChallengeNavDestination.edit(challenge.id))
                                    } label: {
                                        challengeCard(challenge)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("challenge-edit-btn")
                                }
                            }
                            .padding(.horizontal, PFSpacing.screenPadding)
                            .padding(.vertical, PFSpacing.itemGap)
                        }
                    }
                } // end VStack
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
        .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
            guard let rawGameId = notification.userInfo?["gameId"] as? String,
                  rawGameId.lowercased() == game.id.uuidString.lowercased(),
                  let type = notification.userInfo?["type"] as? String,
                  type == "game_config",
                  let data = notification.userInfo?["data"] as? [String: Any],
                  let entity = data["entity"] as? String,
                  entity == "challenges" else { return }
            Task { await loadData() }
        }
    }

    // MARK: - Challenge Card

    @ViewBuilder
    private func challengeCard(_ challenge: Challenge) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(challenge.title)
                    .font(.headline)
                    .foregroundStyle(Color.pfText)
                HStack(spacing: 6) {
                    Text(challenge.answerType == "none" ? locale.t("common.checkIn") : challenge.answerType == "file" ? locale.t("operator.fileUpload") : locale.t("operator.textInput"))
                        .font(.caption)
                        .foregroundStyle(Color.pfTextMuted)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.pfTextMuted.opacity(0.12))
                        .clipShape(Capsule())
                    if challenge.locationBound {
                        Image(systemName: "location.fill")
                            .font(.caption2)
                            .foregroundStyle(Color.pfCheckedIn)
                    }
                }
                Text(baseNameForChallenge(challenge))
                    .font(.caption)
                    .foregroundStyle(Color.pfTextMuted)
            }
            Spacer()
            Text(locale.t("operator.pts", challenge.points))
                .font(.subheadline)
                .fontWeight(.bold)
                .foregroundStyle(Color.pfPending)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
        .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
    }

    private func baseNameForChallenge(_ challenge: Challenge) -> String {
        // Find assignment where teamId == nil (global assignment) for this challenge
        if let assignment = assignments.first(where: { $0.challengeId == challenge.id && $0.teamId == nil }),
           let base = bases.first(where: { $0.id == assignment.baseId }) {
            return base.name
        }
        // Fallback: check if any base has this challenge as its fixedChallengeId
        if let base = bases.first(where: { $0.fixedChallengeId == challenge.id }) {
            return base.name
        }
        return locale.t("operator.noBase")
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)
            async let tagsResult = appState.apiClient.listTags(gameId: game.id, token: token)
            let (c, b, a, t) = try await (challengesResult, basesResult, assignmentsResult, tagsResult)
            challenges = c
            bases = b
            assignments = a
            gameTags = t
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
