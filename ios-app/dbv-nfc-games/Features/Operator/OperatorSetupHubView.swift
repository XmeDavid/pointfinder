import SwiftUI

struct OperatorSetupHubView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    var onShowMap: () -> Void = {}

    @State private var bases: [Base] = []
    @State private var challenges: [Challenge] = []
    @State private var teams: [Team] = []
    @State private var assignments: [Assignment] = []
    @State private var isLoading = true
    @State private var showGoLiveAlert = false
    @State private var teamVariablesComplete = true
    @State private var showBases = false
    @State private var showChallenges = false
    @State private var showTeams = false
    @State private var showStages = false
    @State private var showManageTags = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    private var fixedChallengeIds: Set<UUID> { Set(bases.compactMap(\.fixedChallengeId)) }
    private var assignedChallengeIds: Set<UUID> { Set(assignments.map(\.challengeId)) }
    private var unassignedLocationBound: Int {
        challenges.filter { $0.locationBound && !fixedChallengeIds.contains($0.id) && !assignedChallengeIds.contains($0.id) }.count
    }

    private var warnings: [String] {
        var result: [String] = []
        if bases.isEmpty { result.append(locale.t("operator.warningNoBases")) }
        let unlinkedNfc = bases.filter { !$0.nfcLinked }.count
        if unlinkedNfc > 0 { result.append(locale.t("operator.warningNfcMissing", unlinkedNfc)) }
        if challenges.isEmpty { result.append(locale.t("operator.warningNoChallenges")) }
        if teams.isEmpty { result.append(locale.t("operator.warningNoTeams")) }
        if unassignedLocationBound > 0 { result.append(locale.t("operator.warningLocationBoundUnassigned", unassignedLocationBound)) }
        if !challenges.isEmpty && !bases.isEmpty && challenges.count < bases.count { result.append(locale.t("operator.warningNotEnoughChallenges")) }
        if !teamVariablesComplete { result.append(locale.t("setup.teamVariablesIncomplete")) }
        return result
    }

    private var readinessItems: [SetupReadinessItem] {
        let nfcMissing = bases.filter { !$0.nfcLinked }.count
        let challengeReady = !challenges.isEmpty && (bases.isEmpty || challenges.count >= bases.count) && unassignedLocationBound == 0
        let challengeDetail: String
        if challenges.isEmpty {
            challengeDetail = locale.t("operator.warningNoChallenges")
        } else if unassignedLocationBound > 0 {
            challengeDetail = locale.t("operator.warningLocationBoundUnassigned", unassignedLocationBound)
        } else if challenges.count < bases.count {
            challengeDetail = locale.t("operator.warningNotEnoughChallenges")
        } else {
            challengeDetail = locale.t("setup.challengesReady", challenges.count)
        }

        return [
            SetupReadinessItem(id: "bases", label: locale.t("operator.bases"), detail: bases.isEmpty ? locale.t("operator.warningNoBases") : locale.t("setup.basesCount", bases.count), ready: !bases.isEmpty),
            SetupReadinessItem(id: "nfc", label: locale.t("setup.nfc"), detail: nfcMissing > 0 ? locale.t("operator.warningNfcMissing", nfcMissing) : locale.t("setup.nfcReady"), ready: !bases.isEmpty && nfcMissing == 0),
            SetupReadinessItem(id: "challenges", label: locale.t("operator.challenges"), detail: challengeDetail, ready: challengeReady),
            SetupReadinessItem(id: "teams", label: locale.t("operator.teams"), detail: teams.isEmpty ? locale.t("operator.warningNoTeams") : locale.t("setup.teamsReady", teams.count), ready: !teams.isEmpty),
            SetupReadinessItem(id: "variables", label: locale.t("setup.teamVariables"), detail: teamVariablesComplete ? locale.t("setup.teamVariablesReady") : locale.t("setup.teamVariablesIncomplete"), ready: teamVariablesComplete),
        ]
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView(locale.t("operator.loading"))
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(spacing: PFSpaceToken.space4) {
                            gameHeader
                            SetupSpatialSummary(
                                title: locale.t("setup.spatialPlan"),
                                description: locale.t("setup.spatialPlanDescription"),
                                basesLabel: locale.t("setup.basesCount", bases.count),
                                nfcLabel: locale.t("setup.nfcCount", bases.filter(\.nfcLinked).count, bases.count),
                                assignmentsLabel: locale.t("setup.assignmentsCount", assignments.count),
                                openMapLabel: locale.t("setup.openMap"),
                                action: onShowMap
                            )
                            SetupReadinessPanel(
                                title: locale.t("setup.launchReadiness"),
                                readyLabel: locale.t("setup.readyCount", readinessItems.filter(\.ready).count, readinessItems.count),
                                items: readinessItems
                            )
                            resources
                            SetupLaunchButton(label: locale.t("operator.goLive"), enabled: warnings.isEmpty) { showGoLiveAlert = true }
                        }
                        .padding(.horizontal, PFSpacing.screenPadding)
                        .padding(.vertical, PFSpaceToken.space3)
                    }
                    .background(PFColorToken.surfaceCanvas)
                }
            }
            .navigationTitle(locale.t("operator.setup"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadData() }
            .refreshable { await loadData() }
            .alert(locale.t("operator.goLiveConfirmTitle"), isPresented: $showGoLiveAlert) {
                Button(locale.t("operator.goLive")) { Task { await goLive() } }
                Button(locale.t("common.cancel"), role: .cancel) {}
            } message: { Text(locale.t("operator.goLiveConfirmMessage")) }
            .fullScreenCover(isPresented: $showBases) { BasesManagementView(game: game, onDismiss: { showBases = false }) }
            .fullScreenCover(isPresented: $showChallenges) { ChallengesManagementView(game: game, onDismiss: { showChallenges = false }) }
            .fullScreenCover(isPresented: $showTeams) { TeamsManagementView(game: game, onDismiss: { showTeams = false }) }
            .fullScreenCover(isPresented: $showStages) { StagesManagementView(game: game, onDismiss: { showStages = false }) }
            .fullScreenCover(isPresented: $showManageTags) { ManageTagsView(game: game, onDismiss: { showManageTags = false }) }
        }
    }

    private var gameHeader: some View {
        HStack {
            VStack(alignment: .leading, spacing: PFSpaceToken.space1) {
                Text(game.name).font(.title3.bold()).foregroundStyle(PFColorToken.contentPrimary)
                Text(locale.t("game.status.\(game.status)").uppercased())
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(OperatorTone.info.color)
                    .accessibilityIdentifier("game-status-label")
            }
            Spacer()
            OperatorStatusBadge(label: locale.t("setup.fieldPlan"), tone: .info)
        }
        .padding(PFSpaceToken.space4)
        .background(PFColorToken.surfacePanel)
        .clipShape(RoundedRectangle(cornerRadius: PFRadiusToken.lg))
    }

    private var resources: some View {
        VStack(alignment: .leading, spacing: PFSpaceToken.space2) {
            Text(locale.t("operator.manage").uppercased()).font(.caption.weight(.semibold)).foregroundStyle(PFColorToken.contentSecondary)
            SetupResourceRow(systemImage: "mappin.and.ellipse", label: locale.t("operator.bases"), value: "\(bases.count)", tone: bases.isEmpty ? .pending : .info) { showBases = true }
            SetupResourceRow(systemImage: "questionmark.circle", label: locale.t("operator.challenges"), value: "\(challenges.count)", tone: challenges.isEmpty ? .pending : .info) { showChallenges = true }
            SetupResourceRow(systemImage: "person.3", label: locale.t("operator.teams"), value: "\(teams.count)", tone: teams.isEmpty ? .pending : .info) { showTeams = true }
                .accessibilityIdentifier("nav-teams")
            SetupResourceRow(systemImage: "list.number", label: locale.t("setup.stages"), value: locale.t("setup.configure"), tone: .muted) { showStages = true }
            SetupResourceRow(systemImage: "tag", label: locale.t("tags.manage"), value: locale.t("setup.configure"), tone: .muted) { showManageTags = true }
        }
    }

    private func loadData() async {
        guard let token else { return }
        do {
            async let basesResult = appState.apiClient.getGameBases(gameId: game.id, token: token)
            async let challengesResult = appState.apiClient.getChallenges(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            async let assignmentsResult = appState.apiClient.getAssignments(gameId: game.id, token: token)
            (bases, challenges, teams, assignments) = try await (basesResult, challengesResult, teamsResult, assignmentsResult)
            teamVariablesComplete = ((try? await appState.apiClient.getTeamVariablesCompleteness(gameId: game.id, token: token))?.complete) ?? true
        } catch is CancellationError {
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    private func goLive() async {
        guard let token else { return }
        do {
            _ = try await appState.apiClient.updateGameStatus(gameId: game.id, request: UpdateGameStatusRequest(status: "live"), token: token)
            NotificationCenter.default.post(name: .mobileRealtimeEvent, object: nil, userInfo: ["gameId": game.id.uuidString, "type": "game_status", "data": ["status": "live"]])
        } catch is CancellationError {
        } catch {
            appState.setError(error.localizedDescription)
        }
    }
}
