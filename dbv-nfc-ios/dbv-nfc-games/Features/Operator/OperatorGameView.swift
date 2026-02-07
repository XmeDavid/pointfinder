import SwiftUI

struct OperatorGameView: View {
    @Environment(AppState.self) private var appState

    let game: Game

    @State private var bases: [Base] = []
    @State private var isLoading = true

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading bases...")
            } else if bases.isEmpty {
                ContentUnavailableView(
                    "No Bases",
                    systemImage: "mappin.slash",
                    description: Text("This game doesn't have any bases yet. Create bases in the web admin.")
                )
            } else {
                List(bases) { base in
                    NavigationLink {
                        NFCWriteView(game: game, base: base)
                    } label: {
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
                                Label("Linked", systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Label("Not Linked", systemImage: "circle.dashed")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await loadBases()
        }
        .task {
            await loadBases()
        }
    }

    private func loadBases() async {
        guard case .userOperator(let token, _, _) = appState.authType else { return }
        isLoading = true
        do {
            bases = try await appState.apiClient.getGameBases(gameId: game.id, token: token)
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
