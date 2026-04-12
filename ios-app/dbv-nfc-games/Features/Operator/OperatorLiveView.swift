import SwiftUI

struct OperatorLiveView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var selectedSegment = 0
    @State private var leaderboard: [LeaderboardEntry] = []
    @State private var activity: [ActivityEvent] = []
    @State private var teams: [Team] = []
    @State private var stages: [Stage] = []
    @State private var isLoading = true
    @State private var lastSyncedAt: Date? = nil
    @State private var showStagesManagement = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    // MARK: - Computed Stats

    private var pendingCount: Int {
        activity.filter { $0.type == "submission" }.count
    }

    private var progressPercent: Int {
        guard !leaderboard.isEmpty else { return 0 }
        let maxCompleted = leaderboard.map { $0.completedChallenges }.max() ?? 0
        guard maxCompleted > 0 else { return 0 }
        let totalCompleted = leaderboard.map { $0.completedChallenges }.reduce(0, +)
        let totalPossible = leaderboard.count * maxCompleted
        return Int((Double(totalCompleted) / Double(totalPossible)) * 100)
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: PFSpacing.sectionGap) {

                    // Offline sync badge
                    if !appState.realtimeConnected, let syncedAt = lastSyncedAt {
                        offlineBadge(syncedAt)
                    }

                    // Stats strip
                    if !isLoading {
                        statsStrip
                    }

                    // Stage status card
                    if !stages.isEmpty {
                        stageStatusCard
                    }

                    // Segmented picker
                    Picker("", selection: $selectedSegment) {
                        Text(locale.t("operator.leaderboard")).tag(0)
                        Text(locale.t("operator.activity")).tag(1)
                    }
                    .pickerStyle(.segmented)

                    // Content
                    if isLoading {
                        loadingView
                    } else {
                        switch selectedSegment {
                        case 0:
                            leaderboardView
                        default:
                            activityView
                        }
                    }
                }
                .padding(.horizontal, PFSpacing.screenPadding)
                .padding(.vertical, 12)
            }
            .navigationTitle(locale.t("operator.live"))
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadData() }
            .refreshable { await loadData() }
            .onReceive(NotificationCenter.default.publisher(for: .mobileRealtimeEvent)) { notification in
                guard let rawGameId = notification.userInfo?["gameId"] as? String,
                      UUID(uuidString: rawGameId) == game.id else { return }
                Task { await loadData() }
            }
            .sheet(isPresented: $showStagesManagement) {
                StagesManagementView(game: game, onDismiss: { showStagesManagement = false })
            }
        }
    }

    // MARK: - Offline Badge

    @ViewBuilder
    private func offlineBadge(_ syncedAt: Date) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "wifi.slash")
                .font(.caption2)
            Text(locale.t("operator.lastSynced", formatSyncTime(syncedAt)))
                .font(.caption2)
        }
        .foregroundStyle(Color.pfTextMuted)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
        .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("offline-sync-badge")
    }

    // MARK: - Stats Strip

    @ViewBuilder
    private var statsStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: PFSpacing.itemGap) {
                LiveStatPill(
                    value: "\(teams.count)",
                    label: "Teams",
                    color: .pfText
                )
                LiveStatPill(
                    value: "\(pendingCount)",
                    label: "Pending",
                    color: pendingCount > 0 ? .pfPending : .pfText
                )
                LiveStatPill(
                    value: "\(progressPercent)%",
                    label: "Progress",
                    color: .pfCompleted
                )
            }
            .padding(.horizontal, 2)
        }
    }

    // MARK: - Stage Status Card

    @ViewBuilder
    private var stageStatusCard: some View {
        let sortedStages = stages.sorted { $0.orderIndex < $1.orderIndex }
        let currentStage = sortedStages.last { $0.isActive }
        let currentIndex = currentStage.flatMap { s in sortedStages.firstIndex { $0.id == s.id } }
        let totalCount = sortedStages.count

        HStack(spacing: 12) {
            Image(systemName: "list.number")
                .font(.title3)
                .foregroundStyle(Color.pfPrimary)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                if let stage = currentStage {
                    Text(stage.name)
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.pfText)
                    Text("Stage \((currentIndex ?? 0) + 1) of \(totalCount)")
                        .font(.caption)
                        .foregroundStyle(Color.pfTextMuted)
                } else {
                    Text("No active stage")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.pfText)
                    Text("\(totalCount) stage(s) configured")
                        .font(.caption)
                        .foregroundStyle(Color.pfTextMuted)
                }
            }

            Spacer()

            Button {
                showStagesManagement = true
            } label: {
                Text("Manage →")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.pfPrimary)
            }
            .accessibilityIdentifier("manage-stages-btn")
        }
        .padding(PFSpacing.cardPadding)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
        .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
        .accessibilityIdentifier("stage-status-card")
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(locale.t("operator.loading"))
                .font(.subheadline)
                .foregroundStyle(Color.pfTextMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }

    // MARK: - Leaderboard

    @ViewBuilder
    private var leaderboardView: some View {
        if leaderboard.isEmpty {
            emptyState(
                icon: "trophy",
                title: locale.t("operator.noLeaderboard"),
                description: locale.t("operator.noLeaderboardDesc")
            )
            .accessibilityIdentifier("leaderboard-view")
        } else {
            VStack(spacing: PFSpacing.itemGap) {
                ForEach(Array(leaderboard.enumerated()), id: \.element.id) { index, entry in
                    leaderboardRow(rank: index + 1, entry: entry)
                }
            }
            .accessibilityIdentifier("leaderboard-view")
        }
    }

    @ViewBuilder
    private func leaderboardRow(rank: Int, entry: LeaderboardEntry) -> some View {
        let isTopThree = rank <= 3
        let rColor = rankColor(rank)

        HStack(spacing: 10) {
            // Rank number
            Text("\(rank)")
                .font(.system(.subheadline, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(rColor)
                .frame(width: 24)

            // Team color dot
            Circle()
                .fill(Color(hex: entry.color) ?? .blue)
                .frame(width: 12, height: 12)

            // Name + completed
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.teamName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(Color.pfText)
                Text(locale.t("operator.completedCount", entry.completedChallenges))
                    .font(.caption2)
                    .foregroundStyle(Color.pfTextMuted)
            }

            Spacer()

            // Points
            Text(locale.t("operator.pts", entry.points))
                .font(.system(.title3, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(Color.pfText)
        }
        .padding(12)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.card))
        .shadow(color: .black.opacity(0.03), radius: 4, y: 1)
        .overlay(alignment: .leading) {
            if isTopThree {
                RoundedRectangle(cornerRadius: 2)
                    .fill(rColor)
                    .frame(width: 3)
                    .padding(.vertical, 4)
                    .padding(.leading, 0)
            }
        }
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: return .yellow       // Gold
        case 2: return Color(UIColor.systemGray)  // Silver
        case 3: return .orange       // Bronze
        default: return .pfText
        }
    }

    // MARK: - Activity

    @ViewBuilder
    private var activityView: some View {
        if activity.isEmpty {
            emptyState(
                icon: "clock",
                title: locale.t("operator.noActivity"),
                description: locale.t("operator.noActivityDesc")
            )
            .accessibilityIdentifier("submission-list")
        } else {
            let teamColorMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.id, $0.color) })

            VStack(spacing: PFSpacing.itemGap) {
                ForEach(activity) { event in
                    activityCard(event: event, teamColorMap: teamColorMap)
                }
            }
            .accessibilityIdentifier("submission-list")
        }
    }

    @ViewBuilder
    private func activityCard(event: ActivityEvent, teamColorMap: [UUID: String]) -> some View {
        let eColor = eventColor(event.type)
        let eIcon = eventIcon(event.type)

        HStack(spacing: 10) {
            // Colored left bar
            RoundedRectangle(cornerRadius: 2)
                .fill(eColor)
                .frame(width: 3)

            // Event icon
            Image(systemName: eIcon)
                .font(.caption)
                .foregroundStyle(eColor)
                .frame(width: 20)

            // Content
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    // Team color dot if available
                    if let teamId = event.teamId, let colorHex = teamColorMap[teamId] {
                        Circle()
                            .fill(Color(hex: colorHex) ?? .blue)
                            .frame(width: 8, height: 8)
                    }
                    Text(event.message)
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.pfText)
                        .lineLimit(2)
                }
                Text(formatTimestamp(event.timestamp))
                    .font(.caption)
                    .foregroundStyle(Color.pfTextMuted)
            }

            Spacer()

            // Relative timestamp (compact)
            Text(relativeTime(event.timestamp))
                .font(.caption2)
                .foregroundStyle(Color.pfTextMuted)
        }
        .padding(10)
        .background(Color.pfCard)
        .clipShape(RoundedRectangle(cornerRadius: PFRadius.small))
        .shadow(color: .black.opacity(0.02), radius: 3, y: 1)
    }

    // MARK: - Empty State

    @ViewBuilder
    private func emptyState(icon: String, title: String, description: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(Color.pfTextMuted)
            Text(title)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundStyle(Color.pfTextMuted)
            Text(description)
                .font(.caption)
                .foregroundStyle(Color.pfTextMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
        .padding(.horizontal, 24)
    }

    // MARK: - Event Helpers

    private func eventIcon(_ type: String) -> String {
        switch type {
        case "check_in": return "location.fill"
        case "submission": return "paperplane.fill"
        case "approval": return "checkmark.circle.fill"
        case "rejection": return "xmark.circle.fill"
        default: return "circle.fill"
        }
    }

    private func eventColor(_ type: String) -> Color {
        switch type {
        case "check_in": return Color.pfCheckedIn
        case "submission": return Color.pfPending
        case "approval": return Color.pfCompleted
        case "rejection": return Color.pfRejected
        default: return .gray
        }
    }

    private func formatTimestamp(_ timestamp: String) -> String {
        guard let date = DateFormatting.parseISO8601(timestamp) else {
            return timestamp
        }
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func relativeTime(_ timestamp: String) -> String {
        guard let date = DateFormatting.parseISO8601(timestamp) else {
            return ""
        }
        let relative = RelativeDateTimeFormatter()
        relative.unitsStyle = .abbreviated
        return relative.localizedString(for: date, relativeTo: Date())
    }

    // MARK: - Data Loading

    private func loadData() async {
        guard let token else { return }
        do {
            async let leaderboardResult = appState.apiClient.getLeaderboard(gameId: game.id, token: token)
            async let activityResult = appState.apiClient.getActivity(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            let (l, a, t) = try await (leaderboardResult, activityResult, teamsResult)
            leaderboard = l
            activity = a
            teams = t
            lastSyncedAt = Date()

            // Load stages separately — non-critical, don't fail the whole view
            do {
                stages = try await appState.apiClient.getStages(gameId: game.id, token: token)
            } catch {
                // Stages are non-critical for live monitoring
            }
        } catch is CancellationError {
            // Task cancelled during navigation
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }

    private func formatSyncTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}

// MARK: - LiveStatPill

private struct LiveStatPill: View {
    let value: String
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(.subheadline, design: .rounded))
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.pfTextMuted)
                .textCase(.uppercase)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 4, y: 1)
    }
}
