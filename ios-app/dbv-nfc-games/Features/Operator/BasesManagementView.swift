import SwiftUI
import CoreLocation

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
    @State private var gameTags: [GameTag] = []
    @State private var selectedTagIds: Set<UUID> = []
    @State private var isLoading = true
    @State private var path = NavigationPath()

    private var filteredBases: [Base] {
        guard !selectedTagIds.isEmpty else { return bases }
        return bases.filter { base in
            selectedTagIds.allSatisfy { tagId in base.tagIds?.contains(tagId) == true }
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
            } else if bases.isEmpty {
                ContentUnavailableView(
                    locale.t("operator.noBases"),
                    systemImage: "mappin.slash",
                    description: Text(locale.t("operator.noBasesDesc"))
                )
            } else {
                VStack(spacing: 0) {
                    if !gameTags.isEmpty {
                        TagFilterBar(
                            tags: gameTags,
                            selectedTagIds: $selectedTagIds,
                            clearLabel: locale.t("tags.clearFilters")
                        )
                        .accessibilityIdentifier("bases-tag-filter-bar")
                    }
                    if filteredBases.isEmpty {
                        ContentUnavailableView(
                            locale.t("tags.noBasesFiltered"),
                            systemImage: "line.3.horizontal.decrease.circle"
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: PFSpacing.itemGap) {
                                ForEach(filteredBases) { base in
                                    Button {
                                        path.append(BaseNavDestination.edit(base.id))
                                    } label: {
                                        baseCard(base)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("base-edit-btn")
                                }
                            }
                            .padding(.horizontal, PFSpacing.screenPadding)
                            .padding(.vertical, PFSpacing.itemGap)
                        }
                        .background(Color.pfBackground)
                    }
                }
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
                        assignments: assignments,
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
                let lastBase = bases.last
                let initialCoord: CLLocationCoordinate2D = if let base = lastBase {
                    CLLocationCoordinate2D(latitude: base.lat, longitude: base.lng)
                } else {
                    TileSources.defaultCenter(for: game.tileSource)
                }
                BaseEditView(
                    game: game,
                    base: nil,
                    bases: bases,
                    challenges: challenges,
                    assignments: assignments,
                    initialCoordinate: initialCoord,
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

    // MARK: - Base Card

    @ViewBuilder
    private func baseCard(_ base: Base) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(base.name)
                    .font(.headline)
                    .foregroundStyle(Color.pfText)
                if !base.description.isEmpty {
                    Text(base.description)
                        .font(.caption)
                        .foregroundStyle(Color.pfTextMuted)
                        .lineLimit(1)
                }
                Text(challengeInfoForBase(base))
                    .font(.caption)
                    .foregroundStyle(Color.pfTextMuted)
            }
            Spacer()
            HStack(spacing: 6) {
                if base.hidden {
                    Image(systemName: "eye.slash")
                        .font(.caption)
                        .foregroundStyle(Color.pfTextMuted)
                }
                HStack(spacing: 4) {
                    Circle()
                        .fill(base.nfcLinked ? Color.pfCompleted : Color.pfPending)
                        .frame(width: 7, height: 7)
                    Text(base.nfcLinked ? locale.t("operator.linked") : locale.t("operator.notLinked"))
                        .font(.caption2)
                        .foregroundStyle(base.nfcLinked ? Color.pfCompleted : Color.pfPending)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background((base.nfcLinked ? Color.pfCompleted : Color.pfPending).opacity(0.15))
                .clipShape(Capsule())
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
        .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
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
            async let tagsResult = appState.apiClient.listTags(gameId: game.id, token: token)
            let (b, c, a, t) = try await (basesResult, challengesResult, assignmentsResult, tagsResult)
            bases = b
            challenges = c
            assignments = a
            gameTags = t
        } catch is CancellationError {
            // Task cancelled during navigation — not an error
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
