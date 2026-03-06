import SwiftUI

struct OperatorSetupHubView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var bases: [Base] = []
    @State private var challenges: [Challenge] = []
    @State private var teams: [Team] = []
    @State private var assignments: [Assignment] = []
    @State private var isLoading = true
    @State private var showGoLiveAlert = false
    @State private var showBases = false
    @State private var showChallenges = false
    @State private var showTeams = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    private var warnings: [SetupWarning] {
        var result: [SetupWarning] = []

        if bases.isEmpty {
            result.append(SetupWarning(text: locale.t("operator.warningNoBases"), icon: "mappin.slash"))
        }

        let unlinkedNfc = bases.filter { !$0.nfcLinked }.count
        if unlinkedNfc > 0 {
            result.append(SetupWarning(
                text: locale.t("operator.warningNfcMissing", unlinkedNfc),
                icon: "sensor.tag.radiowaves.forward"
            ))
        }

        if challenges.isEmpty {
            result.append(SetupWarning(text: locale.t("operator.warningNoChallenges"), icon: "questionmark.circle"))
        }

        if teams.isEmpty {
            result.append(SetupWarning(text: locale.t("operator.warningNoTeams"), icon: "person.3"))
        }

        let assignedChallengeIds = Set(assignments.map { $0.challengeId })
        let unassignedLocationBound = challenges.filter { $0.locationBound && !assignedChallengeIds.contains($0.id) }.count
        if unassignedLocationBound > 0 {
            result.append(SetupWarning(
                text: locale.t("operator.warningLocationBoundUnassigned", unassignedLocationBound),
                icon: "location.slash"
            ))
        }

        if !challenges.isEmpty && !bases.isEmpty && challenges.count < bases.count {
            result.append(SetupWarning(text: locale.t("operator.warningNotEnoughChallenges"), icon: "exclamationmark.triangle"))
        }

        return result
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        // Game info
                        Section {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(game.name)
                                    .font(.title2)
                                    .fontWeight(.bold)
                                Text("\(locale.t("operator.status")): \(game.status.uppercased())")
                                    .font(.caption)
                                    .fontWeight(.medium)
                                    .foregroundStyle(game.status == "setup" ? .orange : .green)
                            }
                            .padding(.vertical, 4)
                        }

                        // Warnings
                        if !warnings.isEmpty {
                            Section(locale.t("operator.needsAttention")) {
                                ForEach(warnings, id: \.text) { warning in
                                    Label(warning.text, systemImage: warning.icon)
                                        .font(.subheadline)
                                        .foregroundStyle(.orange)
                                }
                            }
                        }

                        // Manage section
                        Section(locale.t("operator.manage")) {
                            Button { showBases = true } label: {
                                HStack {
                                    Label(locale.t("operator.bases"), systemImage: "mappin.and.ellipse")
                                    Spacer()
                                    Text("(\(bases.count))")
                                        .foregroundStyle(.secondary)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .foregroundStyle(.primary)

                            Button { showChallenges = true } label: {
                                HStack {
                                    Label(locale.t("operator.challenges"), systemImage: "questionmark.circle")
                                    Spacer()
                                    Text("(\(challenges.count))")
                                        .foregroundStyle(.secondary)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .foregroundStyle(.primary)

                            Button { showTeams = true } label: {
                                HStack {
                                    Label(locale.t("operator.teams"), systemImage: "person.3")
                                    Spacer()
                                    Text("(\(teams.count))")
                                        .foregroundStyle(.secondary)
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.tertiary)
                                }
                            }
                            .foregroundStyle(.primary)
                        }

                        // Go Live button
                        Section {
                            Button {
                                showGoLiveAlert = true
                            } label: {
                                Text(locale.t("operator.goLive"))
                                    .fontWeight(.semibold)
                                    .frame(maxWidth: .infinity)
                            }
                            .disabled(!warnings.isEmpty)
                        }
                    }
                }
            }
            .navigationTitle(locale.t("operator.setup"))
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await loadData()
            }
            .refreshable {
                await loadData()
            }
            .alert(locale.t("operator.goLiveConfirmTitle"), isPresented: $showGoLiveAlert) {
                Button(locale.t("operator.goLive")) {
                    Task { await goLive() }
                }
                Button(locale.t("common.cancel"), role: .cancel) {}
            } message: {
                Text(locale.t("operator.goLiveConfirmMessage"))
            }
            .fullScreenCover(isPresented: $showBases) {
                BasesManagementView(game: game, onDismiss: { showBases = false })
            }
            .fullScreenCover(isPresented: $showChallenges) {
                ChallengesManagementView(game: game, onDismiss: { showChallenges = false })
            }
            .fullScreenCover(isPresented: $showTeams) {
                TeamsManagementView(game: game, onDismiss: { showTeams = false })
            }
        }
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)

            let (b, c, t, a) = try await (basesResult, challengesResult, teamsResult, assignmentsResult)
            bases = b
            challenges = c
            teams = t
            assignments = a
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    private func goLive() async {
        guard let token else { return }
        do {
            _ = try await appState.apiClient.updateGameStatus(
                gameId: game.id,
                request: UpdateGameStatusRequest(status: "live"),
                token: token
            )
            // Post local event so OperatorGameView updates gameStatus and switches tab
            NotificationCenter.default.post(
                name: .mobileRealtimeEvent,
                object: nil,
                userInfo: [
                    "gameId": game.id.uuidString,
                    "type": "game_status",
                    "data": ["status": "live"]
                ]
            )
        } catch {
            appState.setError(error.localizedDescription)
        }
    }
}

private struct SetupWarning {
    let text: String
    let icon: String
}
