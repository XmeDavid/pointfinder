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
                } else if let errorMessage, games.isEmpty {
                    ContentUnavailableView {
                        Label(locale.t("common.error"), systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button(locale.t("common.refresh")) { Task { await loadGames() } }
                    }
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
                    ScrollView {
                        LazyVStack(spacing: PFSpacing.itemGap) {
                            workspaceSwitcher
                                .padding(.bottom, 4)

                            GameLibrarySummary(metrics: gameMetrics)

                            ForEach(games) { game in
                                GameLibraryCard(
                                    name: game.name,
                                    description: game.description,
                                    statusLabel: locale.t("game.status.\(game.status)"),
                                    statusTone: statusTone(for: game.status),
                                    action: { selectedGame = game }
                                )
                            }
                        }
                        .padding(.horizontal, PFSpacing.screenPadding)
                        .padding(.vertical, PFSpacing.itemGap)
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
            // Email invite deep link: user tapped a /dashboard universal
            // link. Reveal the My Invites sheet so pending invitations are
            // immediately visible instead of stranding the user on the
            // games list. Flag is cleared after consumption.
            .onChange(of: appState.pendingDashboardDeepLink, initial: true) { _, newValue in
                guard newValue else { return }
                showMyInvites = true
                appState.pendingDashboardDeepLink = false
                Task { await pollInviteCount() }
            }
        }
    }

    private var gameMetrics: [GameLibraryMetric] {
        [
            GameLibraryMetric(id: "setup", value: "\(games.filter { $0.status == "setup" }.count)", label: locale.t("game.status.setup"), tone: .info),
            GameLibraryMetric(id: "live", value: "\(games.filter { $0.status == "live" }.count)", label: locale.t("game.status.live"), tone: .success),
            GameLibraryMetric(id: "ended", value: "\(games.filter { $0.status == "ended" }.count)", label: locale.t("game.status.ended"), tone: .muted),
        ]
    }

    // MARK: - Workspace Switcher

    @ViewBuilder
    private var workspaceSwitcher: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Personal workspace button
                workspaceButton(
                    label: locale.t("operator.personalWorkspace"),
                    detail: workspaces.map { locale.t("operator.gamesCount", $0.personal.activeGames) },
                    isSelected: selectedOrgId == nil,
                    action: { selectedOrgId = nil }
                )

                // One button per organization
                if let orgs = workspaces?.organizations {
                    ForEach(orgs) { org in
                        workspaceButton(
                            label: org.name,
                            detail: locale.t("operator.membersCount", org.memberCount),
                            isSelected: selectedOrgId == org.id,
                            action: { selectedOrgId = org.id }
                        )
                    }
                }
            }
            .padding(.horizontal, PFSpacing.screenPadding)
            .padding(.vertical, 4)
        }
        .padding(.horizontal, -PFSpacing.screenPadding)
    }

    private func workspaceButton(label: String, detail: String?, isSelected: Bool, action: @escaping () -> Void) -> some View {
        GameLibraryWorkspaceChip(label: label, detail: detail, selected: isSelected, action: action)
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

    private func statusTone(for status: String) -> OperatorTone {
        switch status {
        case "live": return .success
        case "setup": return .info
        case "ended": return .muted
        default: return .muted
        }
    }
}

#Preview {
    OperatorHomeView()
        .environment(AppState())
        .environment(LocaleManager())
}
