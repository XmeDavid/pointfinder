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

    /// Translation key for use with `locale.t()` in views.
    var translationKey: String {
        switch self {
        case .notVisited: return "common.notVisited"
        case .checkedIn: return "common.checkedIn"
        case .submitted: return "common.pendingReview"
        case .completed: return "status.completed"
        case .rejected: return "status.rejected"
        }
    }

    /// Localized label using the current language from UserDefaults.
    /// For use in non-view code where LocaleManager environment isn't available.
    var label: String {
        Translations.string(translationKey)
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
    var baseId: UUID
    var baseName: String
    var lat: Double
    var lng: Double
    var nfcLinked: Bool
    var status: String
    var checkedInAt: String?
    var challengeId: UUID?
    var submissionStatus: String?

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
        let completionContent: String?
        let answerType: String
        let points: Int
        let requirePresenceToSubmit: Bool

        init(id: UUID, title: String, description: String, content: String, completionContent: String?, answerType: String, points: Int, requirePresenceToSubmit: Bool = false) {
            self.id = id
            self.title = title
            self.description = description
            self.content = content
            self.completionContent = completionContent
            self.answerType = answerType
            self.points = points
            self.requirePresenceToSubmit = requirePresenceToSubmit
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decode(UUID.self, forKey: .id)
            title = try container.decode(String.self, forKey: .title)
            description = try container.decode(String.self, forKey: .description)
            content = try container.decode(String.self, forKey: .content)
            completionContent = try container.decodeIfPresent(String.self, forKey: .completionContent)
            answerType = try container.decode(String.self, forKey: .answerType)
            points = try container.decode(Int.self, forKey: .points)
            requirePresenceToSubmit = try container.decodeIfPresent(Bool.self, forKey: .requirePresenceToSubmit) ?? false
        }
    }
}
