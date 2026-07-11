// Generated from design-system/scenarios.json. Do not edit.
enum PFPreviewScenario: String, CaseIterable, Identifiable {
    case `default`
    case selected
    case disabled
    case loading
    case empty
    case error
    case offline
    case queued
    case stale
    case destructive
    case longCopy

    var id: String { rawValue }
}
