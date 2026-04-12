import SwiftUI

enum BaseStatus: String, Codable {
    case notVisited = "not_visited"
    case checkedIn = "checked_in"
    case submitted = "submitted"
    case completed = "completed"
    case rejected = "rejected"

    var color: Color {
        switch self {
        case .notVisited: return .pfInactive
        case .checkedIn:  return .pfCheckedIn
        case .submitted:  return .pfPending
        case .completed:  return .pfCompleted
        case .rejected:   return .pfRejected
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

/// Player-facing per-base progress row.
///
/// P1 Phase 4 W4 — naming contract: players see challenge titles, not
/// base names. The `challengeTitle` field is nullable because a base
/// may not have a challenge assigned for the player's team (e.g. a
/// hidden base that is purely a check-in-only unlock target). Views
/// should fall back to a localized placeholder like "???" or
/// `base.defaultName` when `challengeTitle` is `nil`.
struct BaseProgress: Codable, Identifiable {
    var baseId: UUID
    var challengeTitle: String?
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

    /// Localized display label for use on player-facing surfaces.
    /// Falls back to `base.defaultName` when the challenge title is
    /// missing (e.g. hidden base with no assignment for this team).
    var displayTitle: String {
        if let title = challengeTitle, !title.isEmpty { return title }
        return Translations.string("base.defaultName")
    }
}

/// Player-facing check-in response.
///
/// P1 Phase 4 W4 — naming contract: this DTO no longer carries the
/// operator-oriented base name. Players see the challenge title via
/// the nested `ChallengeInfo`.
struct CheckInResponse: Codable {
    let checkInId: UUID
    let baseId: UUID
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
