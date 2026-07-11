import SwiftUI

struct StagesManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onDismiss: (() -> Void)? = nil

    enum StageNavDestination: Hashable {
        case edit(UUID)
        case create
    }

    @State private var stages: [Stage] = []
    @State private var bases: [Base] = []
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
            } else if stages.isEmpty {
                ContentUnavailableView(
                    locale.t("stages.noStages"),
                    systemImage: "list.number",
                    description: Text(locale.t("stages.noStagesDesc"))
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: PFSpacing.itemGap) {
                        ManagementListSummary(label: locale.t("stages.title"), count: stages.count)
                        ForEach(stages.sorted { $0.orderIndex < $1.orderIndex }) { stage in
                            ManagementResourceRow(
                                title: stage.name,
                                subtitle: stage.description,
                                metadata: [
                                    ManagementMetadata(label: transitionLabel(for: stage.transitionType), tone: .info),
                                    ManagementMetadata(label: baseCountLabel(stage), tone: .muted),
                                    ManagementMetadata(label: stage.isActive ? locale.t("stages.active") : locale.t("stages.inactive"), tone: stage.isActive ? .success : .muted),
                                ],
                                systemImage: "list.number",
                                action: { path.append(StageNavDestination.edit(stage.id)) }
                            )
                            .accessibilityIdentifier("stage-edit-btn")
                        }
                    }
                    .padding(.horizontal, PFSpacing.screenPadding)
                    .padding(.vertical, PFSpacing.itemGap)
                }
            }
        }
        .navigationTitle(locale.t("stages.title"))
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
                    path.append(StageNavDestination.create)
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityIdentifier("create-stage-btn")
            }
        }
        .navigationDestination(for: StageNavDestination.self) { destination in
            switch destination {
            case .edit(let stageId):
                if let stage = stages.first(where: { $0.id == stageId }) {
                    StageEditView(
                        game: game,
                        stage: stage,
                        stages: stages,
                        bases: bases,
                        onSaved: { updatedStage in
                            if let index = stages.firstIndex(where: { $0.id == updatedStage.id }) {
                                stages[index] = updatedStage
                            }
                            Task { await loadData() }
                        },
                        onDeleted: {
                            stages.removeAll { $0.id == stageId }
                            path.removeLast()
                        }
                    )
                }
            case .create:
                StageEditView(
                    game: game,
                    stage: nil,
                    stages: stages,
                    bases: bases,
                    onSaved: { newStage in
                        stages.append(newStage)
                        Task { await loadData() }
                        path.removeLast()
                        path.append(StageNavDestination.edit(newStage.id))
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
                  type == "game_config" else { return }
            Task { await loadData() }
        }
    }

    private func transitionLabel(for transitionType: String) -> String {
        switch transitionType {
        case "scheduled":
            return locale.t("stages.scheduled")
        case "trigger":
            return locale.t("stages.trigger")
        default:
            return locale.t("stages.manual")
        }
    }

    private func baseCountLabel(_ stage: Stage) -> String {
        let count = stage.baseIds?.count ?? 0
        return count == 1 ? locale.t("stages.oneBase") : String(format: locale.t("stages.nBases"), count)
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let stagesResult = appState.apiClient.getStages(gameId: game.id, token: token)
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            let (s, b) = try await (stagesResult, basesResult)
            stages = s
            bases = b
        } catch is CancellationError {
            // Task cancelled during navigation — not an error
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
