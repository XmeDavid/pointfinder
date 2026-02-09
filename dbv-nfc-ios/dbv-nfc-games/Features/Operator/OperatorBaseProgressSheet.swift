import SwiftUI

struct OperatorBaseProgressSheet: View {
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss
    
    let base: Base
    let teams: [Team]
    let progress: [TeamBaseProgressResponse]
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Base info header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(base.name)
                            .font(.title2)
                            .fontWeight(.bold)
                        
                        if !base.description.isEmpty {
                            Text(base.description)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        
                        HStack(spacing: 16) {
                            Label(String(format: "%.4f, %.4f", base.lat, base.lng), systemImage: "location")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            
                            if base.nfcLinked {
                                Label(locale.t("nfc.nfcLinked"), systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            } else {
                                Label(locale.t("nfc.nfcNotLinked"), systemImage: "xmark.circle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            }
                        }
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    
                    // Summary stats
                    SummaryStatsView(teams: teams, progress: progress)
                    
                    // Team status list
                    VStack(alignment: .leading, spacing: 12) {
                        Text(locale.t("operator.teamStatus"))
                            .font(.headline)
                        
                        if teams.isEmpty {
                            Text(locale.t("operator.noTeams"))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        } else {
                            ForEach(teams) { team in
                                TeamStatusRow(
                                    team: team,
                                    progress: progress.first { $0.teamId == team.id }
                                )
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle(locale.t("operator.baseDetails"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(locale.t("common.done")) {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Summary Stats View

struct SummaryStatsView: View {
    @Environment(LocaleManager.self) private var locale

    let teams: [Team]
    let progress: [TeamBaseProgressResponse]
    
    private var completedCount: Int {
        progress.filter { $0.baseStatus == .completed }.count
    }
    
    private var pendingCount: Int {
        progress.filter { $0.baseStatus == .submitted }.count
    }
    
    private var checkedInCount: Int {
        progress.filter { $0.baseStatus == .checkedIn }.count
    }
    
    private var notVisitedCount: Int {
        teams.count - progress.count
    }
    
    private var rejectedCount: Int {
        progress.filter { $0.baseStatus == .rejected }.count
    }
    
    var body: some View {
        HStack(spacing: 12) {
            StatBadge(count: completedCount, label: locale.t("status.completed"), color: .green)
            StatBadge(count: pendingCount, label: locale.t("map.pending"), color: .orange)
            StatBadge(count: checkedInCount, label: locale.t("status.checkedIn"), color: .blue)
            StatBadge(count: notVisitedCount + rejectedCount, label: locale.t("operator.remaining"), color: .gray)
        }
    }
}

struct StatBadge: View {
    let count: Int
    let label: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 4) {
            Text("\(count)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(color.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Team Status Row

struct TeamStatusRow: View {
    @Environment(LocaleManager.self) private var locale

    let team: Team
    let progress: TeamBaseProgressResponse?
    
    private var teamColor: Color {
        Color(hex: team.color) ?? .blue
    }
    
    private var status: BaseStatus {
        progress?.baseStatus ?? .notVisited
    }
    
    var body: some View {
        HStack(spacing: 12) {
            // Team color indicator
            Circle()
                .fill(teamColor)
                .frame(width: 12, height: 12)
            
            // Team name
            Text(team.name)
                .font(.body)
                .fontWeight(.medium)
            
            Spacer()
            
            // Status badge
            HStack(spacing: 4) {
                Image(systemName: status.systemImage)
                    .font(.caption)
                Text(locale.t(status.translationKey))
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .foregroundStyle(status.color)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(status.color.opacity(0.15))
            .clipShape(Capsule())
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
    }
}

// MARK: - Preview

#Preview {
    OperatorBaseProgressSheet(
        base: Base(
            id: UUID(),
            gameId: UUID(),
            name: "Base Camp Alpha",
            description: "Located near the main entrance",
            lat: 40.123,
            lng: -8.456,
            nfcLinked: true,
            requirePresenceToSubmit: false,
            fixedChallengeId: nil
        ),
        teams: [
            Team(id: UUID(), name: "Red Dragons", color: "#ef4444"),
            Team(id: UUID(), name: "Blue Hawks", color: "#3b82f6"),
            Team(id: UUID(), name: "Green Wolves", color: "#22c55e"),
        ],
        progress: []
    )
    .environment(LocaleManager())
}
