import SwiftUI

struct OperatorLiveView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game

    @State private var selectedSegment = 0
    @State private var leaderboard: [LeaderboardEntry] = []
    @State private var activity: [ActivityEvent] = []
    @State private var teams: [Team] = []
    @State private var isLoading = true

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType {
            return token
        }
        return nil
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Segmented picker
                Picker("", selection: $selectedSegment) {
                    Text(locale.t("operator.leaderboard")).tag(0)
                    Text(locale.t("operator.activity")).tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                .padding(.vertical, 8)

                // Content
                if isLoading {
                    Spacer()
                    ProgressView(locale.t("operator.loading"))
                    Spacer()
                } else {
                    switch selectedSegment {
                    case 0:
                        leaderboardView
                    default:
                        activityView
                    }
                }
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
        }
    }

    // MARK: - Leaderboard

    @ViewBuilder
    private var leaderboardView: some View {
        if leaderboard.isEmpty {
            ContentUnavailableView(
                locale.t("operator.noLeaderboard"),
                systemImage: "trophy",
                description: Text(locale.t("operator.noLeaderboardDesc"))
            )
        } else {
            List {
                ForEach(Array(leaderboard.enumerated()), id: \.element.id) { index, entry in
                    let rank = index + 1
                    let isTopThree = rank <= 3

                    HStack(spacing: 12) {
                        // Rank
                        Text("#\(rank)")
                            .font(isTopThree ? .title3 : .body)
                            .fontWeight(isTopThree ? .bold : .regular)
                            .foregroundStyle(rankColor(rank))
                            .frame(width: 36)

                        // Team color dot
                        Circle()
                            .fill(Color(hex: entry.color) ?? .blue)
                            .frame(width: 14, height: 14)

                        // Team name + completed
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.teamName)
                                .fontWeight(isTopThree ? .semibold : .regular)
                            Text(locale.t("operator.completedCount", entry.completedChallenges))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        // Points
                        Text(locale.t("operator.pts", entry.points))
                            .fontWeight(.bold)
                            .foregroundStyle(isTopThree ? rankColor(rank) : .primary)
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(isTopThree ? rankColor(rank).opacity(0.08) : Color.clear)
                }
            }
            .listStyle(.plain)
        }
    }

    private func rankColor(_ rank: Int) -> Color {
        switch rank {
        case 1: return Color(red: 1, green: 0.84, blue: 0)       // Gold
        case 2: return Color(red: 0.75, green: 0.75, blue: 0.75) // Silver
        case 3: return Color(red: 0.80, green: 0.50, blue: 0.20) // Bronze
        default: return .primary
        }
    }

    // MARK: - Activity

    @ViewBuilder
    private var activityView: some View {
        if activity.isEmpty {
            ContentUnavailableView(
                locale.t("operator.noActivity"),
                systemImage: "clock",
                description: Text(locale.t("operator.noActivityDesc"))
            )
        } else {
            let teamColorMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.id, $0.color) })

            List(activity) { event in
                HStack(alignment: .top, spacing: 10) {
                    // Event type icon
                    Image(systemName: eventIcon(event.type))
                        .font(.body)
                        .foregroundStyle(eventColor(event.type))
                        .frame(width: 24)

                    // Team color dot
                    if let teamId = event.teamId, let colorHex = teamColorMap[teamId] {
                        Circle()
                            .fill(Color(hex: colorHex) ?? .blue)
                            .frame(width: 10, height: 10)
                            .padding(.top, 5)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text(event.message)
                            .font(.subheadline)
                        Text(formatTimestamp(event.timestamp))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 2)
            }
            .listStyle(.plain)
        }
    }

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
        case "check_in": return .blue
        case "submission": return .orange
        case "approval": return .green
        case "rejection": return .red
        default: return .gray
        }
    }

    private func formatTimestamp(_ timestamp: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: timestamp) ?? ISO8601DateFormatter().date(from: timestamp) else {
            return timestamp
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
        } catch {
            appState.setError(error.localizedDescription)
        }
        isLoading = false
    }
}
