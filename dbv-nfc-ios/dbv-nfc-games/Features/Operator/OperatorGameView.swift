import SwiftUI

enum OperatorViewMode: String, CaseIterable {
    case liveMap = "Live Map"
    case bases = "Bases"
}

struct OperatorGameView: View {
    @Environment(AppState.self) private var appState

    let game: Game

    @State private var bases: [Base] = []
    @State private var isLoading = true
    @State private var viewMode: OperatorViewMode = .liveMap

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        VStack(spacing: 0) {
            // Segmented picker
            Picker("View Mode", selection: $viewMode) {
                ForEach(OperatorViewMode.allCases, id: \.self) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            // Content based on selected mode
            Group {
                if isLoading {
                    Spacer()
                    ProgressView("Loading...")
                    Spacer()
                } else if bases.isEmpty {
                    ContentUnavailableView(
                        "No Bases",
                        systemImage: "mappin.slash",
                        description: Text("This game doesn't have any bases yet. Create bases in the web admin.")
                    )
                } else {
                    switch viewMode {
                    case .liveMap:
                        if let token = token {
                            OperatorMapView(gameId: game.id, token: token, bases: bases)
                        }
                    case .bases:
                        BasesListView(game: game, bases: bases)
                    }
                }
            }
        }
        .navigationTitle(game.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadBases()
        }
    }

    private func loadBases() async {
        guard let token = token else { return }
        isLoading = true
        do {
            bases = try await appState.apiClient.getGameBases(gameId: game.id, token: token)
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}

// MARK: - Bases List View (NFC Setup)

struct BasesListView: View {
    let game: Game
    let bases: [Base]

    var body: some View {
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
        .listStyle(.plain)
    }
}
