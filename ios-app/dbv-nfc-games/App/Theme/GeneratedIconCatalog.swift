// Generated from design-system/icons.json. Do not edit.
enum PFSemanticIcon: String, CaseIterable {
    case scan
    case base
    case team
    case review
    case rescue
    case sync
    case location
    case map
    case notifications
    case results
    case setup
    case command
    case settings

    var systemName: String {
        switch self {
        case .scan: "wave.3.right.circle"
        case .base: "mappin.circle"
        case .team: "person.3"
        case .review: "checklist"
        case .rescue: "lifepreserver"
        case .sync: "arrow.triangle.2.circlepath"
        case .location: "location"
        case .map: "map"
        case .notifications: "bell"
        case .results: "trophy"
        case .setup: "hammer"
        case .command: "dot.radiowaves.left.and.right"
        case .settings: "gearshape"
        }
    }
}
