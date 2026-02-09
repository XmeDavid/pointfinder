import SwiftUI

struct OperatorGameView: View {
    @Environment(AppState.self) private var appState

    let game: Game
    let onBack: () -> Void

    @State private var bases: [Base] = []
    @State private var isLoading = true

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        Group {
            if isLoading {
                VStack {
                    ProgressView("Loading...")
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if bases.isEmpty {
                ContentUnavailableView(
                    "No Bases",
                    systemImage: "mappin.slash",
                    description: Text("This game doesn't have any bases yet. Create bases in the web admin.")
                )
            } else {
                TabView {
                    // Live Map tab
                    if let token = token {
                        OperatorMapView(gameId: game.id, token: token, bases: bases)
                            .tabItem {
                                Label("Live Map", systemImage: "map.fill")
                            }
                    }

                    // Bases / NFC Setup tab
                    NavigationStack {
                        BasesListView(game: game, bases: bases)
                            .navigationTitle("Bases")
                            .navigationBarTitleDisplayMode(.inline)
                    }
                    .tabItem {
                        Label("Bases", systemImage: "mappin.and.ellipse")
                    }

                    // Settings tab (back to game list, logout)
                    OperatorSettingsView(game: game, onBack: onBack)
                        .tabItem {
                            Label("Settings", systemImage: "gearshape.fill")
                        }
                }
            }
        }
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

// MARK: - Operator Settings View

struct OperatorSettingsView: View {
    @Environment(AppState.self) private var appState

    let game: Game
    let onBack: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Label("Game", systemImage: "gamecontroller")
                        Spacer()
                        Text(game.name)
                            .foregroundStyle(.secondary)
                    }

                    HStack {
                        Label("Status", systemImage: "circle.fill")
                        Spacer()
                        Text(game.status.capitalized)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Current Game")
                }

                Section {
                    Button {
                        onBack()
                    } label: {
                        Label("Switch Game", systemImage: "arrow.left.circle")
                    }

                    Button(role: .destructive) {
                        appState.logout()
                    } label: {
                        Label("Logout", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Bases List View (NFC Setup)

struct BasesListView: View {
    let game: Game
    let bases: [Base]

    var body: some View {
        List(bases) { base in
            NavigationLink {
                BaseDetailView(game: game, base: base)
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
