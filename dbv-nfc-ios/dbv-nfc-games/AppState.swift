//
//  AppState.swift
//  dbv-nfc-games
//
//  Observable application state and simple helpers.
//

import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    // Authentication
    @Published var authToken: String?
    @Published var adminToken: String?

    // Current session context
    @Published var currentGame: Game?
    @Published var currentTeam: Team?
    @Published var teamProgress: [TeamBaseProgress] = []

    // Active enigma session
    struct EnigmaSession: Identifiable, Equatable {
        var id: String { baseId + "::" + enigma.id }
        let baseId: BaseID
        var enigma: Enigma
        var isSolved: Bool
    }
    @Published var enigmaSession: EnigmaSession?

    // Offline queue
    @Published var queuedActions: [QueuedAction] = []
    private let queueStorageURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return dir.appendingPathComponent("queued_actions.json")
    }()
    private var queueSaveDebounceTask: Task<Void, Never>?
    private var syncTimer: Timer?

    // Device identifier used for leader-only enforcement
    let deviceId: String

    // API base URL (hardcoded)
    var apiBaseURL: URL { URL(string: "https://dbvnfc-api.davidsbatista.com")! }
    var isAdmin: Bool { adminToken != nil }

    // MARK: - Init

    init(userDefaults: UserDefaults = .standard) {
        self.deviceId = AppState.loadOrCreateDeviceId(userDefaults: userDefaults)
        self.queuedActions = (try? Self.loadQueue(from: queueStorageURL)) ?? []
        startSyncTimer()
    }

    // MARK: - Offline Queue

    func enqueue(kind: String, payload: Encodable?) {
        let data = payload.flatMap { try? JSONEncoder().encode(AnyEncodable($0)) }
        let action = QueuedAction(kind: kind, data: data)
        queuedActions.append(action)
        scheduleQueueSave()
    }

    func clearQueue() {
        queuedActions.removeAll()
        scheduleQueueSave()
    }

    // MARK: - Progress Helpers

    func upsertProgress(forBaseId baseId: BaseID, mutate: (inout TeamBaseProgress) -> Void) {
        if let index = teamProgress.firstIndex(where: { $0.baseId == baseId }) {
            var existing = teamProgress[index]
            mutate(&existing)
            teamProgress[index] = existing
        } else {
            var created = TeamBaseProgress(baseId: baseId, arrivedAt: nil, solvedAt: nil, completedAt: nil, score: 0)
            mutate(&created)
            teamProgress.append(created)
        }
    }

    // MARK: - NFC Tag Processing

    enum TagProcessError: LocalizedError {
        case notAuthenticated
        case noGameLoaded
        case notLeader
        case unknownTag
        case mustSolveEnigmaFirst

        var errorDescription: String? {
            switch self {
            case .notAuthenticated: return "Please join a team first."
            case .noGameLoaded: return "Game not loaded yet."
            case .notLeader: return "Only the team leader can scan NFC."
            case .unknownTag: return "This NFC tag is not part of the game."
            case .mustSolveEnigmaFirst: return "Solve the enigma before completing."
            }
        }
    }

    enum TagOutcome {
        case arrived(base: GameBase, enigma: Enigma)
        case completed(base: GameBase)
    }

    func processTag(uuid: String) async -> Result<TagOutcome, TagProcessError> {
        guard let token = authToken, let team = currentTeam else { return .failure(.notAuthenticated) }
        guard let game = currentGame else { return .failure(.noGameLoaded) }
        guard team.leaderDeviceID == deviceId else { return .failure(.notLeader) }

        guard let base = game.bases.first(where: { $0.nfcTagUUID.lowercased() == uuid.lowercased() }) else {
            return .failure(.unknownTag)
        }

        // Determine if this is arrival or completion
        var progress = teamProgress.first(where: { $0.baseId == base.id })
        let now = Date()

        if progress?.arrivedAt == nil {
            // First tap: arrival
            let chosen = selectEnigma(for: base, from: game)
            if let chosen = chosen {
                enigmaSession = EnigmaSession(baseId: base.id, enigma: chosen, isSolved: false)
            }
            upsertProgress(forBaseId: base.id) { row in
                row.arrivedAt = now
            }
            await postTapEvent(baseId: base.id, uuid: uuid, action: "arrived", token: token)
            return .success(.arrived(base: base, enigma: enigmaSession?.enigma ?? Enigma(id: "unknown", baseId: base.id, instructions: EnigmaInstructions(text: "", imageURLs: nil), answerRule: .exact)))
        } else {
            // Second tap: completion only if solved
            if enigmaSession?.baseId == base.id && enigmaSession?.isSolved == false {
                return .failure(.mustSolveEnigmaFirst)
            }
            upsertProgress(forBaseId: base.id) { row in
                if row.solvedAt == nil { row.solvedAt = now }
                row.completedAt = now
            }
            enigmaSession = nil
            await postTapEvent(baseId: base.id, uuid: uuid, action: "completed", token: token)
            return .success(.completed(base: base))
        }
    }

    private func selectEnigma(for base: GameBase, from game: Game) -> Enigma? {
        if let fixed = game.enigmas.first(where: { $0.baseId == base.id }) { return fixed }
        return game.enigmas.first(where: { $0.baseId == nil })
    }

    private func postTapEvent(baseId: BaseID, uuid: String, action: String, token: String) async {
        let client = APIClient(baseURL: apiBaseURL)
        let tap = APIClient.TapEvent(baseId: baseId, tagUUID: uuid, action: action, timestamp: Date())
        do {
            try await client.postProgress(teamId: currentTeam?.id ?? "", tap: tap, token: token)
        } catch {
            enqueue(kind: "tap:\(action)", payload: tap)
        }
    }

    // MARK: - Enigma Answering

    func validateAndMarkSolved(answer raw: String) -> Bool {
        guard var session = enigmaSession else { return false }
        let normalized = normalize(answerText: raw, rule: session.enigma.answerRule)
        // Client-side check is best-effort. Here we only check non-empty.
        let ok = normalized.isEmpty == false
        if ok {
            upsertProgress(forBaseId: session.baseId) { row in
                row.solvedAt = Date()
            }
            session.isSolved = true
            enigmaSession = session
        }
        return ok
    }

    private func normalize(answerText: String, rule: AnswerRule) -> String {
        switch rule {
        case .exact:
            return answerText.trimmingCharacters(in: .whitespacesAndNewlines)
        case .appendTeamID:
            let teamId = currentTeam?.id ?? ""
            return answerText.trimmingCharacters(in: .whitespacesAndNewlines) + teamId
        }
    }

    // MARK: - Device ID

    private static func loadOrCreateDeviceId(userDefaults: UserDefaults) -> String {
        let key = "app.device.id"
        if let existing = userDefaults.string(forKey: key), existing.isEmpty == false {
            return existing
        }
        let generated = UUID().uuidString
        userDefaults.set(generated, forKey: key)
        return generated
    }

    // MARK: - Queue Persistence

    private static func loadQueue(from url: URL) throws -> [QueuedAction] {
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([QueuedAction].self, from: data)
    }

    private func saveQueue() {
        do {
            let data = try JSONEncoder().encode(queuedActions)
            try data.write(to: queueStorageURL, options: [.atomic])
        } catch { }
    }

    private func scheduleQueueSave() {
        queueSaveDebounceTask?.cancel()
        queueSaveDebounceTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            await MainActor.run { self?.saveQueue() }
        }
    }

    // MARK: - Sync Timer

    private func startSyncTimer() {
        syncTimer?.invalidate()
        syncTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { await self?.trySyncQueue() }
        }
    }

    deinit {
        syncTimer?.invalidate()
    }

    func trySyncQueue() async {
        guard let token = authToken, queuedActions.isEmpty == false else { return }
        let client = APIClient(baseURL: apiBaseURL)
        var remaining: [QueuedAction] = []
        for action in queuedActions {
            if action.kind.hasPrefix("tap:") {
                if let data = action.data, let tap = try? JSONDecoder().decode(APIClient.TapEvent.self, from: data) {
                    do { try await client.postProgress(teamId: currentTeam?.id ?? "", tap: tap, token: token) } catch { remaining.append(action) }
                } else {
                    remaining.append(action)
                }
            } else if action.kind == "locationPing" {
                if let data = action.data, let dict = try? JSONDecoder().decode([String:String].self, from: data) {
                    let event = APIClient.AppEvent(type: "locationPing", details: dict, timestamp: Date())
                    do { try await client.postEvent(event, token: token) } catch { remaining.append(action) }
                } else {
                    remaining.append(action)
                }
            } else {
                remaining.append(action)
            }
        }
        await MainActor.run {
            queuedActions = remaining
            scheduleQueueSave()
        }
    }
}

// MARK: - Type Erasure for Encoding Arbitrary Payloads

private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void

    init<T: Encodable>(_ wrapped: T) {
        _encode = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}


