import SwiftUI

struct OperatorHomeView: View {
    @Environment(AppState.self) private var appState

    @State private var games: [Game] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedGame: Game?

    var body: some View {
        if let game = selectedGame {
            OperatorGameView(game: game, onBack: { selectedGame = nil })
        } else {
            gameListView
                .task {
                    await loadGames()
                }
        }
    }

    private var gameListView: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView("Loading games...")
                } else if games.isEmpty {
                    ContentUnavailableView(
                        "No Games",
                        systemImage: "gamecontroller",
                        description: Text("You don't have any games assigned yet.")
                    )
                } else {
                    List(games) { game in
                        Button {
                            selectedGame = game
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(game.name)
                                        .font(.headline)
                                    Text(game.description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }

                                Spacer()

                                Text(game.status.capitalized)
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(statusColor(for: game.status).opacity(0.2))
                                    .foregroundStyle(statusColor(for: game.status))
                                    .clipShape(Capsule())

                                Image(systemName: "chevron.right")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                        .foregroundStyle(.primary)
                    }
                }
            }
            .navigationTitle("My Games")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        appState.logout()
                    } label: {
                        Text("Logout")
                    }
                }
            }
            .refreshable {
                await loadGames()
            }
        }
    }

    private func loadGames() async {
        guard case .userOperator(let token, _, _) = appState.authType else { return }
        isLoading = true
        do {
            games = try await appState.apiClient.getGames(token: token)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func statusColor(for status: String) -> Color {
        switch status {
        case "live": return .green
        case "setup": return .orange
        case "draft": return .gray
        case "ended": return .red
        default: return .gray
        }
    }
}

#Preview {
    OperatorHomeView()
        .environment(AppState())
}
