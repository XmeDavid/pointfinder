import SwiftUI
import CoreImage
import CoreImage.CIFilterBuiltins

struct TeamDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let game: Game
    let team: Team
    var onSaved: (Team) -> Void
    var onDeleted: () -> Void

    @State private var name: String
    @State private var color: String
    @State private var allTeams: [Team] = []
    @State private var players: [PlayerResponse] = []
    @State private var variables: [TeamVariable] = []
    @State private var variableValues: [String: String] = [:]
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var showDeleteAlert = false
    @State private var showQRCode = false
    @State private var showRemovePlayerAlert = false
    @State private var playerToRemove: PlayerResponse?
    @State private var errorMessage: String?
    @State private var showCopiedToast = false
    @State private var showSaveSuccess = false

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

    init(game: Game, team: Team, onSaved: @escaping (Team) -> Void, onDeleted: @escaping () -> Void) {
        self.game = game
        self.team = team
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        self._name = State(initialValue: team.name)
        self._color = State(initialValue: team.color)
    }

    var body: some View {
        Form {
            // Name & Color
            Section {
                TextField(locale.t("operator.teamName"), text: $name)
                    .accessibilityIdentifier("team-name-input")
                VStack(alignment: .leading, spacing: 8) {
                    Text(locale.t("operator.teamColor"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            ForEach(colorOptions, id: \.self) { hex in
                                Circle()
                                    .fill(Color(hex: hex) ?? .blue)
                                    .frame(width: 36, height: 36)
                                    .overlay {
                                        if color == hex {
                                            Image(systemName: "checkmark")
                                                .font(.caption)
                                                .fontWeight(.bold)
                                                .foregroundStyle(.white)
                                        }
                                    }
                                    .accessibilityLabel(hex)
                                    .accessibilityAddTraits(color == hex ? [.isSelected] : [])
                                    .onTapGesture {
                                        color = hex
                                    }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }

            // Join Code
            if let joinCode = team.joinCode {
                Section(locale.t("operator.joinCode")) {
                    Text(joinCode)
                        .font(.title2)
                        .fontWeight(.semibold)
                        .fontDesign(.monospaced)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 4)
                        .accessibilityIdentifier("team-join-code")

                    Button {
                        UIPasteboard.general.string = joinCode
                        withAnimation {
                            showCopiedToast = true
                        }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation {
                                showCopiedToast = false
                            }
                        }
                    } label: {
                        Label(locale.t("operator.copyCode"), systemImage: "doc.on.doc")
                    }

                    Button {
                        showQRCode = true
                    } label: {
                        Label(locale.t("operator.showQR"), systemImage: "qrcode")
                    }
                }
            }

            // Variables
            Section(locale.t("operator.variables")) {
                if isLoading {
                    ProgressView()
                } else if variables.isEmpty {
                    Text(locale.t("operator.noVariables"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(variables, id: \.key) { variable in
                        HStack {
                            Text(variable.key)
                                .font(.subheadline)
                            Spacer()
                            TextField("", text: Binding(
                                get: { variableValues[variable.key] ?? "" },
                                set: { variableValues[variable.key] = $0 }
                            ))
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 160)
                        }
                    }
                }
            }

            // Players
            Section(locale.t("operator.players")) {
                if isLoading {
                    ProgressView()
                } else if players.isEmpty {
                    Text(locale.t("operator.noPlayers"))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(players) { player in
                        HStack {
                            Text(player.displayName)
                            Spacer()
                            Button(role: .destructive) {
                                playerToRemove = player
                                showRemovePlayerAlert = true
                            } label: {
                                Image(systemName: "person.badge.minus")
                                    .font(.caption)
                                    .foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            // Save button
            Section {
                Button {
                    Task { await save() }
                } label: {
                    Text(isSaving ? locale.t("common.saving") : locale.t("operator.save"))
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .disabled(name.isEmpty || isSaving)
                .accessibilityIdentifier("team-save-btn")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                        .font(.caption)
                }
            }

            // Delete
            Section {
                Button(role: .destructive) {
                    showDeleteAlert = true
                } label: {
                    Label(locale.t("operator.deleteTeam"), systemImage: "trash")
                        .frame(maxWidth: .infinity)
                }
                .accessibilityIdentifier("team-delete-btn")
            }
        }
        .navigationTitle(team.name)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadData()
        }
        .alert(locale.t("operator.deleteTeamConfirmTitle"), isPresented: $showDeleteAlert) {
            Button(locale.t("operator.delete"), role: .destructive) {
                Task { await deleteTeam() }
            }
            Button(locale.t("common.cancel"), role: .cancel) {}
        } message: {
            Text(locale.t("common.cannotUndo"))
        }
        .alert(locale.t("operator.removePlayer"), isPresented: $showRemovePlayerAlert) {
            Button(locale.t("operator.removePlayer"), role: .destructive) {
                if let player = playerToRemove {
                    Task { await removePlayer(player) }
                }
            }
            Button(locale.t("common.cancel"), role: .cancel) {
                playerToRemove = nil
            }
        } message: {
            Text(locale.t("operator.removePlayerConfirm"))
        }
        .sheet(isPresented: $showQRCode) {
            QRCodeSheet(joinCode: team.joinCode ?? "", teamName: team.name)
        }
        .overlay(alignment: .top) {
            if showSaveSuccess {
                Text(locale.t("common.saved"))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.green.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            withAnimation { showSaveSuccess = false }
                        }
                    }
                    .padding(.top, 8)
            }
        }
        .animation(.easeInOut, value: showSaveSuccess)
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

    // MARK: - Data Loading

    private func loadData() async {
        guard let token else { return }
        do {
            async let playersResult = appState.apiClient.getTeamPlayers(gameId: game.id, teamId: team.id, token: token)
            async let variablesResult = appState.apiClient.getGameVariables(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            let (p, v, teams) = try await (playersResult, variablesResult, teamsResult)
            allTeams = teams
            players = p
            variables = normalizedTeamVariables(v.variables, teams: teams)
            // Initialize variable values for this team
            for variable in variables {
                variableValues[variable.key] = variable.teamValues[team.id.uuidString.lowercased()] ?? ""
            }
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    // MARK: - Actions

    private func save() async {
        guard let token else { return }
        isSaving = true
        errorMessage = nil
        do {
            let updatedTeam = try await appState.apiClient.updateTeam(
                gameId: game.id,
                teamId: team.id,
                request: UpdateTeamRequest(name: name, color: color),
                token: token
            )

            // Save variables if any exist
            if !variables.isEmpty {
                let updatedVariables = normalizedTeamVariables(variables, teams: allTeams).map { variable in
                    var teamValues = variable.teamValues
                    teamValues[team.id.uuidString.lowercased()] = variableValues[variable.key] ?? ""
                    return TeamVariable(key: variable.key, teamValues: teamValues)
                }
                _ = try await appState.apiClient.saveGameVariables(
                    gameId: game.id,
                    request: TeamVariablesRequest(variables: updatedVariables),
                    token: token
                )
            }

            withAnimation { showSaveSuccess = true }
            onSaved(updatedTeam)
        } catch {
            errorMessage = error.localizedDescription
        }
        isSaving = false
    }

    private func deleteTeam() async {
        guard let token else { return }
        do {
            try await appState.apiClient.deleteTeam(gameId: game.id, teamId: team.id, token: token)
            onDeleted()
            dismiss()
        } catch {
            appState.setError(error.localizedDescription)
        }
    }

    private func removePlayer(_ player: PlayerResponse) async {
        guard let token else { return }
        do {
            try await appState.apiClient.removePlayer(gameId: game.id, teamId: team.id, playerId: player.id, token: token)
            players.removeAll { $0.id == player.id }
        } catch {
            appState.setError(error.localizedDescription)
        }
        playerToRemove = nil
    }
}

// MARK: - QR Code Sheet

private struct QRCodeSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let joinCode: String
    let teamName: String

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text(teamName)
                    .font(.title2)
                    .fontWeight(.bold)

                if let qrImage = generateQRCode(from: joinCode) {
                    Image(uiImage: qrImage)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 250, height: 250)
                } else {
                    ContentUnavailableView(
                        locale.t("operator.qrCode"),
                        systemImage: "qrcode"
                    )
                }

                Text(joinCode)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .fontDesign(.monospaced)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle(locale.t("operator.qrCode"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(locale.t("common.done")) { dismiss() }
                }
            }
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let data = string.data(using: .utf8)
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent.integral) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
