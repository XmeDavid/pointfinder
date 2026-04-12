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
    @State private var teamVariablesComplete: Bool = true
    @State private var showBases = false
    @State private var showChallenges = false
    @State private var showTeams = false
    @State private var showStages = false
    @State private var showManageTags = false

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

        let fixedChallengeIds = Set(bases.compactMap { $0.fixedChallengeId })
        let assignedChallengeIds = Set(assignments.map { $0.challengeId })
        let unassignedLocationBound = challenges.filter {
            $0.locationBound && !fixedChallengeIds.contains($0.id) && !assignedChallengeIds.contains($0.id)
        }.count
        if unassignedLocationBound > 0 {
            result.append(SetupWarning(
                text: locale.t("operator.warningLocationBoundUnassigned", unassignedLocationBound),
                icon: "location.slash"
            ))
        }

        if !challenges.isEmpty && !bases.isEmpty && challenges.count < bases.count {
            result.append(SetupWarning(text: locale.t("operator.warningNotEnoughChallenges"), icon: "exclamationmark.triangle"))
        }

        if !teamVariablesComplete {
            result.append(SetupWarning(
                text: locale.t("setup.teamVariablesIncomplete"),
                icon: "exclamationmark.triangle.fill"
            ))
        }

        return result
    }

    // MARK: - Subviews

    private var readinessRing: some View {
        let total = 5
        let passing = total - warnings.count
        let progress = warnings.isEmpty ? 1.0 : Double(max(passing, 0)) / Double(total)

        return ZStack {
            Circle()
                .stroke(Color.pfInactive, lineWidth: 3)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    warnings.isEmpty ? Color.pfCompleted : Color.pfPending,
                    style: StrokeStyle(lineWidth: 3, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            Text(warnings.isEmpty ? "✓" : "\(max(passing, 0))/\(total)")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundStyle(warnings.isEmpty ? Color.pfCompleted : Color.pfPending)
        }
        .frame(width: 44, height: 44)
    }

    private var gameHeaderCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(game.name)
                        .font(.title3)
                        .fontWeight(.bold)
                        .foregroundStyle(.pfText)
                    HStack(spacing: 6) {
                        Circle()
                            .fill(game.status == "setup" ? Color.pfPending : Color.pfCompleted)
                            .frame(width: 8, height: 8)
                        Text(game.status.uppercased())
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundStyle(game.status == "setup" ? Color.pfPending : Color.pfCompleted)
                            .accessibilityIdentifier("game-status-label")
                    }
                }
                Spacer()
                readinessRing
            }
        }
        .padding(16)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    @ViewBuilder
    private var warningsSection: some View {
        if !warnings.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(locale.t("operator.needsAttention").uppercased())
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.pfTextMuted)
                    .padding(.leading, 4)

                VStack(spacing: 6) {
                    ForEach(warnings, id: \.text) { warning in
                        HStack(spacing: 10) {
                            Image(systemName: warning.icon)
                                .font(.subheadline)
                                .foregroundStyle(Color.pfPending)
                                .frame(width: 24)
                            Text(warning.text)
                                .font(.subheadline)
                                .foregroundStyle(.pfText)
                            Spacer()
                        }
                        .padding(12)
                        .background(Color.pfPending.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
                    }
                }
            }
        }
    }

    private var manageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(locale.t("operator.manage").uppercased())
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundStyle(.pfTextMuted)
                .padding(.leading, 4)

            VStack(spacing: 6) {
                ManageCard(icon: "tag", label: locale.t("tags.manage"), count: nil) { showManageTags = true }
                ManageCard(icon: "mappin.and.ellipse", label: locale.t("operator.bases"), count: bases.count) { showBases = true }
                ManageCard(icon: "questionmark.circle", label: locale.t("operator.challenges"), count: challenges.count) { showChallenges = true }
                ManageCard(icon: "person.3", label: locale.t("operator.teams"), count: teams.count) { showTeams = true }
                    .accessibilityIdentifier("nav-teams")
                ManageCard(icon: "list.number", label: "Stages", count: nil) { showStages = true }
            }
        }
    }

    private var goLiveButton: some View {
        Button {
            showGoLiveAlert = true
        } label: {
            HStack {
                Image(systemName: "play.fill")
                    .font(.subheadline)
                Text(locale.t("operator.goLive"))
                    .fontWeight(.bold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(warnings.isEmpty ? Color.pfPrimary : Color.pfInactive)
            .foregroundStyle(warnings.isEmpty ? Color.white : Color.pfTextMuted)
            .clipShape(RoundedRectangle(cornerRadius: PFRadius.button))
            .shadow(color: warnings.isEmpty ? Color.pfPrimary.opacity(0.3) : .clear, radius: 8, y: 3)
        }
        .disabled(!warnings.isEmpty)
        .accessibilityIdentifier("game-activate-btn")
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: 20) {
                            gameHeaderCard
                            warningsSection
                            manageSection
                            goLiveButton
                        }
                        .padding(.horizontal, PFSpacing.screenPadding)
                        .padding(.vertical, 12)
                    }
                    .background(Color.pfBackground)
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
            .fullScreenCover(isPresented: $showStages) {
                StagesManagementView(game: game, onDismiss: { showStages = false })
            }
            .fullScreenCover(isPresented: $showManageTags) {
                ManageTagsView(game: game, onDismiss: { showManageTags = false })
            }
        }
    }

    // MARK: - Data

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
            teamVariablesComplete = ((try? await appState.apiClient.getTeamVariablesCompleteness(gameId: game.id, token: token))?.complete) ?? true
        } catch is CancellationError {
            // Task cancelled during navigation
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
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
    }
}

// MARK: - Supporting Types

private struct SetupWarning {
    let text: String
    let icon: String
}

private struct ManageCard: View {
    let icon: String
    let label: String
    let count: Int?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(Color.pfPrimary)
                    .frame(width: 32, height: 32)
                    .background(Color.pfPrimary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(label)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(.pfText)

                Spacer()

                if let count {
                    Text("\(count)")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.pfTextMuted)
                }

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.pfTextMuted)
            }
            .padding(12)
            .background(Color.pfCard)
            .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
            .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
        }
    }
}
