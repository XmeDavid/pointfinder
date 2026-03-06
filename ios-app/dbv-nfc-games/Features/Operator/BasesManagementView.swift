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
                                    Text(base.description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                    Text("(\(String(format: "%.4f", base.lat)), \(String(format: "%.4f", base.lng)))")
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
                                Spacer()
                                if base.nfcLinked {
                                    Label(locale.t("operator.linked"), systemImage: "checkmark.circle.fill")
                                        .font(.caption)
                                        .foregroundStyle(.green)
                                        .labelStyle(.iconOnly)
                                }
                                if base.hidden {
                                    Image(systemName: "eye.slash")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
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
                }
            }
            .navigationDestination(for: BaseNavDestination.self) { destination in
                switch destination {
                case .edit(let baseId):
                    if let base = bases.first(where: { $0.id == baseId }) {
                        BaseEditView(
                            game: game,
                            base: base,
                            challenges: challenges,
                            onSaved: { updatedBase in
                                if let index = bases.firstIndex(where: { $0.id == updatedBase.id }) {
                                    bases[index] = updatedBase
                                }
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
                        challenges: challenges,
                        onSaved: { newBase in
                            bases.append(newBase)
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
        }
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            let (b, c) = try await (basesResult, challengesResult)
            bases = b
            challenges = c
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
