import SwiftUI

struct TeamsManagementView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onDismiss: (() -> Void)? = nil

    @State private var teams: [Team] = []
    @State private var isLoading = true
    @State private var showCreateTeam = false
    @State private var showManageVariables = false
    @State private var copiedTeamId: UUID?
    @State private var showCopiedToast = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if teams.isEmpty {
                    ContentUnavailableView(
                        locale.t("operator.noTeams"),
                        systemImage: "person.3",
                        description: Text(locale.t("operator.noTeamsDesc"))
                    )
                } else {
                    List(teams) { team in
                        NavigationLink(value: team.id) {
                            HStack(spacing: 12) {
                                Circle()
                                    .fill(Color(hex: team.color) ?? .blue)
                                    .frame(width: 28, height: 28)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(team.name)
                                        .font(.headline)
                                    if let joinCode = team.joinCode {
                                        Text(joinCode)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                if let joinCode = team.joinCode {
                                    Button {
                                        UIPasteboard.general.string = joinCode
                                        copiedTeamId = team.id
                                        withAnimation {
                                            showCopiedToast = true
                                        }
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                            if copiedTeamId == team.id {
                                                copiedTeamId = nil
                                            }
                                            withAnimation {
                                                showCopiedToast = false
                                            }
                                        }
                                    } label: {
                                        Image(systemName: copiedTeamId == team.id ? "checkmark" : "doc.on.doc")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(locale.t("operator.teams"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onDismiss {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { onDismiss() } label: {
                            Image(systemName: "xmark")
                        }
                    }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showManageVariables = true
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }

                    Button {
                        showCreateTeam = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .navigationDestination(for: UUID.self) { teamId in
                if let team = teams.first(where: { $0.id == teamId }) {
                    TeamDetailView(
                        game: game,
                        team: team,
                        onSaved: { updatedTeam in
                            if let index = teams.firstIndex(where: { $0.id == updatedTeam.id }) {
                                teams[index] = updatedTeam
                            }
                        },
                        onDeleted: {
                            teams.removeAll { $0.id == teamId }
                        }
                    )
                }
            }
            .sheet(isPresented: $showCreateTeam) {
                TeamCreateSheet(game: game) { newTeam in
                    teams.append(newTeam)
                }
            }
            .sheet(isPresented: $showManageVariables) {
                TeamVariablesManagementSheet(game: game, teams: teams)
            }
            .task {
                await loadData()
            }
            .refreshable {
                await loadData()
            }
            .overlay(alignment: .bottom) {
                if showCopiedToast {
                    Text(locale.t("operator.copied"))
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .padding(.bottom, 20)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
    }

    private func loadData() async {
        guard let token else { return }
        do {
            teams = try await appState.apiClient.getTeams(gameId: game.id, token: token)
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}

// MARK: - Create Team Sheet

private struct TeamCreateSheet: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    var onCreated: (Team) -> Void

    @State private var name = ""
    @State private var selectedColor = "#3b82f6"
    @State private var isCreating = false
    @State private var errorMessage: String?

    private let colorOptions = [
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
        "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e"
    ]

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(locale.t("operator.teamName"), text: $name)
                        .accessibilityIdentifier("team-name-input")
                }

                Section(locale.t("operator.teamColor")) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(colorOptions, id: \.self) { hex in
                                Circle()
                                    .fill(Color(hex: hex) ?? .blue)
                                    .frame(width: 36, height: 36)
                                    .overlay {
                                        if selectedColor == hex {
                                            Image(systemName: "checkmark")
                                                .font(.caption)
                                                .fontWeight(.bold)
                                                .foregroundStyle(.white)
                                        }
                                    }
                                    .onTapGesture {
                                        selectedColor = hex
                                    }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                if let errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle(locale.t("operator.createTeam"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(locale.t("common.cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.create")) {
                        Task { await createTeam() }
                    }
                    .disabled(name.isEmpty || isCreating)
                    .accessibilityIdentifier("team-save-btn")
                }
            }
        }
    }

    private func createTeam() async {
        guard let token else { return }
        isCreating = true
        errorMessage = nil
        do {
            let team = try await appState.apiClient.createTeam(
                gameId: game.id,
                request: CreateTeamRequest(name: name),
                token: token
            )
            // Update color immediately after creation
            let updatedTeam = try await appState.apiClient.updateTeam(
                gameId: game.id,
                teamId: team.id,
                request: UpdateTeamRequest(name: name, color: selectedColor),
                token: token
            )
            onCreated(updatedTeam)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isCreating = false
    }
}
