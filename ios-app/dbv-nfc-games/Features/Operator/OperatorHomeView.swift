import SwiftUI

struct OperatorHomeView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    @State private var games: [Game] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selectedGame: Game?
    @State private var showCreateGame = false
    @State private var showMyInvites = false
    @State private var pendingInviteCount = 0

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
                    ProgressView(locale.t("operator.loadingGames"))
                } else if games.isEmpty {
                    ContentUnavailableView(
                        locale.t("operator.noGames"),
                        systemImage: "gamecontroller",
                        description: Text(locale.t("operator.noGamesDesc"))
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

                                Text(locale.t("game.status.\(game.status)"))
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
            .navigationTitle(locale.t("operator.myGames"))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button(role: .destructive) {
                            Task { await appState.logout() }
                        } label: {
                            Label(locale.t("operator.logout"), systemImage: "rectangle.portrait.and.arrow.right")
                        }
                    } label: {
                        Image(systemName: "person.circle")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showMyInvites = true
                    } label: {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: "bell")
                            if pendingInviteCount > 0 {
                                Text("\(pendingInviteCount)")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(3)
                                    .background(Color.red)
                                    .clipShape(Circle())
                                    .offset(x: 8, y: -8)
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showCreateGame = true
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityIdentifier("create-game-btn")
                }
            }
            .refreshable {
                await loadGames()
            }
            .sheet(isPresented: $showCreateGame) {
                CreateGameView { game in
                    selectedGame = game
                    Task { await loadGames() }
                }
            }
            .sheet(isPresented: $showMyInvites) {
                NavigationStack {
                    MyInvitesView()
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button(locale.t("common.cancel")) {
                                    showMyInvites = false
                                }
                            }
                        }
                }
            }
            .task {
                await pollInviteCount()
            }
        }
    }

    private func pollInviteCount() async {
        guard case .userOperator(let token, _, _) = appState.authType else { return }
        while !Task.isCancelled {
            do {
                let invites = try await appState.apiClient.getMyInvites(token: token)
                pendingInviteCount = invites.filter { $0.status.lowercased() == "pending" }.count
            } catch {
                // Silent failure for background badge polling
            }
            try? await Task.sleep(for: .seconds(30))
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
        case "ended": return .red
        default: return .gray
        }
    }
}

#Preview {
    OperatorHomeView()
        .environment(AppState())
        .environment(LocaleManager())
}
