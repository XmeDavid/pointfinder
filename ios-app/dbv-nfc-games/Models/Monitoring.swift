import Foundation
import SwiftUI

/// Response from GET /api/games/{gameId}/monitoring/locations
struct TeamLocationResponse: Codable, Identifiable {
    let teamId: UUID
    let playerId: UUID?
    let displayName: String?
    let lat: Double
    let lng: Double
    let updatedAt: String
    
    var id: UUID { playerId ?? teamId }
    
    /// Check if the location is stale (older than 5 minutes)
    var isStale: Bool {
        guard let date = parseDate() else { return true }
        return Date().timeIntervalSince(date) > 5 * 60  // 5 minutes
    }
    
    private func parseDate() -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: updatedAt) {
            return date
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: updatedAt)
    }
}

/// Response from GET /api/games/{gameId}/monitoring/progress
struct TeamBaseProgressResponse: Codable, Identifiable {
    let baseId: UUID
    let teamId: UUID
    let status: String
    let checkedInAt: String?
    let challengeId: UUID?
    let submissionStatus: String?
    
    var id: String { "\(baseId)-\(teamId)" }
    
    var baseStatus: BaseStatus {
        BaseStatus(rawValue: status) ?? .notVisited
    }
}

/// Aggregate status for a base across all teams
/// Uses the "worst" status logic from the web admin
enum AggregateBaseStatus {
    case notVisited
    case checkedIn
    case submitted
    case rejected
    case completed
    
    /// Priority for determining aggregate status (lower = worse)
    var priority: Int {
        switch self {
        case .notVisited: return 0
        case .checkedIn: return 1
        case .submitted: return 2
        case .rejected: return 3
        case .completed: return 4
        }
    }
    
    var color: Color {
        switch self {
        case .notVisited: return .gray
        case .checkedIn: return .blue
        case .submitted: return .orange
        case .rejected: return .red
        case .completed: return .green
        }
    }
    
    /// Convert back to BaseStatus for reuse with existing annotation views
    var toBaseStatus: BaseStatus {
        switch self {
        case .notVisited: return .notVisited
        case .checkedIn: return .checkedIn
        case .submitted: return .submitted
        case .rejected: return .rejected
        case .completed: return .completed
        }
    }
    
    static func from(_ status: BaseStatus) -> AggregateBaseStatus {
        switch status {
        case .notVisited: return .notVisited
        case .checkedIn: return .checkedIn
        case .submitted: return .submitted
        case .rejected: return .rejected
        case .completed: return .completed
        }
    }
    
    /// Calculate aggregate status from multiple team statuses
    /// Returns the worst (lowest priority) status
    static func aggregate(_ statuses: [BaseStatus]) -> AggregateBaseStatus {
        guard !statuses.isEmpty else { return .notVisited }
        
        let aggregates = statuses.map { from($0) }
        return aggregates.min(by: { $0.priority < $1.priority }) ?? .notVisited
    }
}
