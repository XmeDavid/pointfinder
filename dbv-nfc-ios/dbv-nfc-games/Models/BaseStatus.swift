import SwiftUI

enum BaseStatus: String, Codable {
    case notVisited = "not_visited"
    case checkedIn = "checked_in"
    case submitted = "submitted"
    case completed = "completed"
    case rejected = "rejected"

    var color: Color {
        switch self {
        case .notVisited: return .gray
        case .checkedIn: return .blue
        case .submitted: return .orange
        case .completed: return .green
        case .rejected: return .red
        }
    }

    var label: String {
        switch self {
        case .notVisited: return "Not Visited"
        case .checkedIn: return "Checked In"
        case .submitted: return "Pending Review"
        case .completed: return "Completed"
        case .rejected: return "Rejected"
        }
    }

    var systemImage: String {
        switch self {
        case .notVisited: return "mappin.circle"
        case .checkedIn: return "mappin.circle.fill"
        case .submitted: return "clock.fill"
        case .completed: return "checkmark.circle.fill"
        case .rejected: return "xmark.circle.fill"
        }
    }
}

struct BaseProgress: Codable, Identifiable {
    let baseId: UUID
    let baseName: String
    let lat: Double
    let lng: Double
    let nfcLinked: Bool
    let status: String
    let checkedInAt: String?
    let challengeId: UUID?
    let submissionStatus: String?

    var id: UUID { baseId }

    var baseStatus: BaseStatus {
        BaseStatus(rawValue: status) ?? .notVisited
    }
}

struct CheckInResponse: Codable {
    let checkInId: UUID
    let baseId: UUID
    let baseName: String
    let checkedInAt: String
    let challenge: ChallengeInfo?

    struct ChallengeInfo: Codable {
        let id: UUID
        let title: String
        let description: String
        let content: String
        let answerType: String
        let points: Int
    }
}
