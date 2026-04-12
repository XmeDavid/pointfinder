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
                    "No Stages",
                    systemImage: "list.number",
                    description: Text("Create stages to gate base visibility during the game.")
                )
            } else {
                List(stages.sorted { $0.orderIndex < $1.orderIndex }) { stage in
                    NavigationLink(value: StageNavDestination.edit(stage.id)) {
                        stageRow(stage)
                    }
                    .accessibilityIdentifier("stage-edit-btn")
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Stages")
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

    @ViewBuilder
    private func stageRow(_ stage: Stage) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(stage.name)
                    .font(.headline)
                    .foregroundStyle(.pfText)
                if !stage.description.isEmpty {
                    Text(stage.description)
                        .font(.caption)
                        .foregroundStyle(.pfTextMuted)
                        .lineLimit(1)
                }
                HStack(spacing: 6) {
                    transitionBadge(for: stage.transitionType)
                    Text(baseCountLabel(stage))
                        .font(.caption)
                        .foregroundStyle(.pfTextMuted)
                }
            }
            Spacer()
            Circle()
                .fill(stage.isActive ? Color.pfCompleted : Color.pfInactive)
                .frame(width: 10, height: 10)
        }
    }

    @ViewBuilder
    private func transitionBadge(for transitionType: String) -> some View {
        switch transitionType {
        case "scheduled":
            Label("Scheduled", systemImage: "clock")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.blue.opacity(0.15))
                .foregroundStyle(.blue)
                .clipShape(Capsule())
        case "trigger":
            Label("Trigger", systemImage: "flag")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.orange.opacity(0.15))
                .foregroundStyle(.orange)
                .clipShape(Capsule())
        default:
            Text("Manual")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Color.secondary.opacity(0.15))
                .foregroundStyle(.secondary)
                .clipShape(Capsule())
        }
    }

    private func baseCountLabel(_ stage: Stage) -> String {
        let count = stage.baseIds?.count ?? 0
        return count == 1 ? "1 base" : "\(count) bases"
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
