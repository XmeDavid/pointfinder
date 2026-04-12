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

    // Workspace state
    @State private var workspaces: WorkspaceResponse?
    @State private var selectedOrgId: UUID?   // nil = personal workspace

    var body: some View {
        if let game = selectedGame {
            OperatorGameView(game: game, onBack: { selectedGame = nil }, selectedOrg: selectedOrg)
        } else {
            gameListView
                .task {
                    await loadGames()
                    await loadWorkspaces()
                }
        }
    }

    // MARK: - Computed

    private var selectedOrg: OrgWorkspace? {
        guard let id = selectedOrgId else { return nil }
        return workspaces?.organizations.first(where: { $0.id == id })
    }

    // MARK: - Views

    private var gameListView: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loadingGames"))
                } else if games.isEmpty {
                    VStack(spacing: 0) {
                        workspaceSwitcher
                            .padding(.horizontal, PFSpacing.screenPadding)
                            .padding(.bottom, PFSpacing.sectionGap)
                        ContentUnavailableView(
                            locale.t("operator.noGames"),
                            systemImage: "gamecontroller",
                            description: Text(locale.t("operator.noGamesDesc"))
                        )
                    }
                } else {
                    List {
                        Section {
                            workspaceSwitcher
                                .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
                                .listRowBackground(Color.clear)
                                .listRowSeparator(.hidden)
                        }
                        ForEach(games) { game in
                            Button {
                                selectedGame = game
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(game.name)
                                            .font(.headline)
                                        Text(game.description)
                                            .font(.caption)
                                            .foregroundStyle(Color.pfTextMuted)
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
                await loadWorkspaces()
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

    // MARK: - Workspace Switcher

    @ViewBuilder
    private var workspaceSwitcher: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Personal workspace button
                workspaceButton(
                    label: "Personal",
                    detail: workspaces.map { "\($0.personal.activeGames) games" },
                    isSelected: selectedOrgId == nil,
                    action: { selectedOrgId = nil }
                )

                // One button per organization
                if let orgs = workspaces?.organizations {
                    ForEach(orgs) { org in
                        workspaceButton(
                            label: org.name,
                            detail: "\(org.memberCount) members",
                            isSelected: selectedOrgId == org.id,
                            action: { selectedOrgId = org.id }
                        )
                    }
                }
            }
            .padding(.horizontal, PFSpacing.screenPadding)
            .padding(.vertical, 4)
        }
    }

    private func workspaceButton(label: String, detail: String?, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.subheadline)
                    .fontWeight(isSelected ? .semibold : .regular)
                if let detail {
                    Text(detail)
                        .font(.caption2)
                        .opacity(0.75)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? Color.pfPrimary.opacity(0.15) : Color.pfCard)
            .foregroundStyle(isSelected ? Color.pfPrimary : Color.pfText)
            .overlay(
                Capsule()
                    .strokeBorder(isSelected ? Color.pfPrimary : Color.pfCardBorder, lineWidth: 1)
            )
            .clipShape(Capsule())
        }
    }

    // MARK: - Data Loading

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

    private func loadWorkspaces() async {
        guard case .userOperator(let token, _, _) = appState.authType else { return }
        do {
            workspaces = try await appState.apiClient.getWorkspaces(token: token)
        } catch {
            // Workspace loading is non-critical; silently ignore errors
        }
    }

    private func statusColor(for status: String) -> Color {
        switch status {
        case "live": return .pfCompleted
        case "setup": return .pfPending
        case "ended": return .pfTextMuted
        default: return .pfTextMuted
        }
    }
}

#Preview {
    OperatorHomeView()
        .environment(AppState())
        .environment(LocaleManager())
}
