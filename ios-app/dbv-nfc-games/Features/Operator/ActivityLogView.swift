import SwiftUI

// MARK: - Activity Log View

struct ActivityLogView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale

    let game: Game
    let onDismiss: () -> Void

    @State private var events: [ActivityEvent] = []
    @State private var teams: [Team] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var typeFilter: String = "all"
    @State private var teamFilter: String = "all"

    // Pagination
    private let pageSize = 50
    @State private var offset = 0
    @State private var hasMore = false
    @State private var isLoadingMore = false

    private var token: String? {
        if case .userOperator(let token, _, _) = appState.authType { return token }
        return nil
    }

    private var filteredEvents: [ActivityEvent] {
        var result = events
        if typeFilter != "all" {
            result = result.filter { $0.type == typeFilter }
        }
        if teamFilter != "all" {
            result = result.filter { $0.teamId?.uuidString.lowercased() == teamFilter }
        }
        return result
    }

    private let allTypes = [
        "check_in", "submission", "approval", "rejection",
        "operator_override", "team_join", "team_switch"
    ]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                filterBar
                Divider()
                contentArea
            }
            .navigationTitle(locale.t("activityLog.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(locale.t("common.close")) { onDismiss() }
                        .accessibilityIdentifier("activity-log-close-btn")
                }
            }
            .task { await loadInitial() }
            .refreshable { await loadInitial() }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Type filter
                Menu {
                    Button(locale.t("common.allTypes")) { typeFilter = "all" }
                    ForEach(allTypes, id: \.self) { type in
                        Button(locale.t("activityLog.eventType.\(type)")) { typeFilter = type }
                    }
                } label: {
                    filterChip(
                        label: typeFilter == "all"
                            ? locale.t("common.allTypes")
                            : locale.t("activityLog.eventType.\(typeFilter)"),
                        isActive: typeFilter != "all"
                    )
                }
                .accessibilityIdentifier("activity-type-filter")

                // Team filter
                Menu {
                    Button(locale.t("common.allTeams")) { teamFilter = "all" }
                    ForEach(teams, id: \.id) { team in
                        Button(team.name) { teamFilter = team.id.uuidString.lowercased() }
                    }
                } label: {
                    filterChip(
                        label: teamFilter == "all"
                            ? locale.t("common.allTeams")
                            : (teams.first { $0.id.uuidString.lowercased() == teamFilter }?.name ?? locale.t("common.allTeams")),
                        isActive: teamFilter != "all"
                    )
                }
                .accessibilityIdentifier("activity-team-filter")

                if typeFilter != "all" || teamFilter != "all" {
                    Button(locale.t("common.clearFilters")) {
                        typeFilter = "all"
                        teamFilter = "all"
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("activity-clear-filters-btn")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .background(Color(.systemGroupedBackground))
    }

    private func filterChip(label: String, isActive: Bool) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.subheadline)
                .lineLimit(1)
            Image(systemName: "chevron.down")
                .font(.caption2)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isActive ? Color.accentColor.opacity(0.15) : Color(.secondarySystemGroupedBackground))
        .foregroundStyle(isActive ? Color.accentColor : Color.primary)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(isActive ? Color.accentColor : Color.secondary.opacity(0.3), lineWidth: 1))
    }

    // MARK: - Content

    @ViewBuilder
    private var contentArea: some View {
        if isLoading && events.isEmpty {
            skeletonView
        } else if let error = errorMessage, events.isEmpty {
            errorView(error)
        } else if filteredEvents.isEmpty {
            emptyView
        } else {
            eventList
        }
    }

    private var skeletonView: some View {
        List {
            ForEach(0..<5, id: \.self) { _ in
                skeletonRow
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("activity-log-skeleton")
    }

    private var skeletonRow: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color(.systemFill))
                .frame(width: 24, height: 24)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemFill))
                    .frame(height: 14)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(.systemFill))
                    .frame(width: 120, height: 12)
            }
        }
        .padding(.vertical, 4)
    }

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "clock")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(typeFilter != "all" || teamFilter != "all"
                 ? locale.t("activityLog.noMatchingEvents")
                 : locale.t("activityLog.noActivity"))
            .font(.headline)
            .multilineTextAlignment(.center)
            if typeFilter != "all" || teamFilter != "all" {
                Button(locale.t("common.clearFilters")) {
                    typeFilter = "all"
                    teamFilter = "all"
                }
                .buttonStyle(.bordered)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
        .accessibilityIdentifier("activity-log-empty")
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text(locale.t("activityLog.loadError"))
                .font(.headline)
                .multilineTextAlignment(.center)
            Text(message)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(locale.t("common.pullToRefresh")) {
                Task { await loadInitial() }
            }
            .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
        .accessibilityIdentifier("activity-log-error")
    }

    private var eventList: some View {
        let teamColorMap = Dictionary(uniqueKeysWithValues: teams.map { ($0.id, $0.color) })
        return List {
            ForEach(filteredEvents) { event in
                ActivityLogRow(event: event, teamColorMap: teamColorMap, locale: locale)
                    .accessibilityIdentifier("activity-row-\(event.id)")
            }
            // Load more
            if hasMore && typeFilter == "all" && teamFilter == "all" {
                if isLoadingMore {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .listRowSeparator(.hidden)
                } else {
                    Button(locale.t("activityLog.loadMore")) {
                        Task { await loadMore() }
                    }
                    .frame(maxWidth: .infinity)
                    .listRowSeparator(.hidden)
                    .accessibilityIdentifier("activity-load-more-btn")
                }
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("activity-log-list")
    }

    // MARK: - Data Loading

    private func loadInitial() async {
        guard let token else { return }
        isLoading = true
        errorMessage = nil
        offset = 0
        do {
            async let eventsResult = appState.apiClient.getActivity(gameId: game.id, token: token)
            async let teamsResult = appState.apiClient.getTeams(gameId: game.id, token: token)
            let (fetchedEvents, fetchedTeams) = try await (eventsResult, teamsResult)
            events = fetchedEvents
            teams = fetchedTeams
            hasMore = fetchedEvents.count >= pageSize
            offset = fetchedEvents.count
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func loadMore() async {
        guard let token, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let more = try await appState.apiClient.getActivity(gameId: game.id, token: token)
            events.append(contentsOf: more)
            hasMore = more.count >= pageSize
            offset += more.count
        } catch {
            // silently fail for load-more; user can retry via load-more button
        }
        isLoadingMore = false
    }
}

// MARK: - Activity Log Row

private struct ActivityLogRow: View {
    let event: ActivityEvent
    let teamColorMap: [UUID: String]
    let locale: LocaleManager

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Event type icon circle
            ZStack {
                Circle()
                    .fill(eventColor(event.type).opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: eventIcon(event.type))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(eventColor(event.type))
            }
            .accessibilityIdentifier("activity-row-icon-\(event.type)")

            VStack(alignment: .leading, spacing: 4) {
                // Badge + team dot
                HStack(spacing: 6) {
                    // Color-coded action badge
                    Text(locale.t("activityLog.eventType.\(event.type)"))
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(eventColor(event.type).opacity(0.15))
                        .foregroundStyle(eventColor(event.type))
                        .clipShape(Capsule())
                        .accessibilityIdentifier("activity-badge-\(event.type)")

                    // Team color dot
                    if let teamId = event.teamId, let colorHex = teamColorMap[teamId] {
                        Circle()
                            .fill(Color(hex: colorHex) ?? .blue)
                            .frame(width: 8, height: 8)
                    }
                }

                // Message
                Text(event.message)
                    .font(.subheadline)
                    .lineLimit(2)

                // Relative timestamp
                Text(relativeTimestamp(event.timestamp))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func eventIcon(_ type: String) -> String {
        switch type {
        case "check_in": return "location.fill"
        case "submission": return "paperplane.fill"
        case "approval": return "checkmark.circle.fill"
        case "rejection": return "xmark.circle.fill"
        case "operator_override": return "person.badge.shield.checkmark.fill"
        case "team_join": return "person.fill.badge.plus"
        case "team_switch": return "arrow.left.arrow.right"
        default: return "circle.fill"
        }
    }

    private func eventColor(_ type: String) -> Color {
        switch type {
        case "check_in": return .blue
        case "submission": return .blue
        case "approval": return .green
        case "rejection": return .red
        case "operator_override": return .orange
        case "team_join", "team_switch": return .gray
        default: return .gray
        }
    }

    private func relativeTimestamp(_ timestamp: String) -> String {
        guard let date = DateFormatting.parseISO8601(timestamp) else { return timestamp }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
