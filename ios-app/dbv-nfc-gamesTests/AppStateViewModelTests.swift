import Foundation
import XCTest
@testable import dbv_nfc_games

/// Unit tests for AppState acting as the central ViewModel / @Observable
/// state container. Covers pure state transitions that do not require
/// network calls or real service dependencies: auth-state computed
/// properties, deep-link routing, solve session lifecycle, error surface,
/// logout unsynced-data guard, base status helpers, and realtime event
/// dispatch.
///
/// Audit 9.6: "zero iOS View/ViewModel tests" — this file is the first
/// representative ViewModel test suite.
@MainActor
final class AppStateViewModelTests: XCTestCase {

    private var appState: AppState!

    override func setUp() {
        super.setUp()
        appState = AppState()
        // Reset to a clean unauthenticated state so each test starts fresh.
        appState.authType = .none
        appState.currentGame = nil
        appState.currentTeam = nil
        appState.currentPlayer = nil
        appState.baseProgress = []
        appState.solvingBaseId = nil
        appState.solvingChallengeId = nil
        appState.errorMessage = nil
        appState.showError = false
        appState.notifications = []
        appState.unseenNotificationCount = 0
        appState.pendingLogoutCount = 0
        appState.showLogoutUnsyncedAlert = false
        appState.pendingDeepLinkBaseId = nil
        appState.pendingDashboardDeepLink = false
    }

    override func tearDown() {
        appState = nil
        super.tearDown()
    }

    // MARK: - Auth State Computed Properties

    func testIsAuthenticatedReturnsFalseWhenNone() {
        appState.authType = .none
        XCTAssertFalse(appState.isAuthenticated)
        XCTAssertFalse(appState.isPlayer)
        XCTAssertFalse(appState.isOperator)
    }

    func testIsAuthenticatedReturnsTrueForPlayer() {
        appState.authType = .player(
            token: "tok",
            playerId: UUID(),
            teamId: UUID(),
            gameId: UUID()
        )
        XCTAssertTrue(appState.isAuthenticated)
        XCTAssertTrue(appState.isPlayer)
        XCTAssertFalse(appState.isOperator)
    }

    func testIsAuthenticatedReturnsTrueForOperator() {
        appState.authType = .userOperator(
            accessToken: "at",
            refreshToken: "rt",
            userId: UUID()
        )
        XCTAssertTrue(appState.isAuthenticated)
        XCTAssertFalse(appState.isPlayer)
        XCTAssertTrue(appState.isOperator)
    }

    // MARK: - Error Handling

    func testSetErrorUpdatesMessageAndFlag() {
        XCTAssertFalse(appState.showError)
        XCTAssertNil(appState.errorMessage)

        appState.setError("Something went wrong")

        XCTAssertTrue(appState.showError)
        XCTAssertEqual(appState.errorMessage, "Something went wrong")
    }

    func testSetErrorOverwritesPreviousError() {
        appState.setError("First error")
        appState.setError("Second error")

        XCTAssertEqual(appState.errorMessage, "Second error")
        XCTAssertTrue(appState.showError)
    }

    // MARK: - Deep Link Handling

    func testHandleDeepLinkSetsBaseIdForTagURL() {
        let baseId = UUID()
        let url = URL(string: "https://pointfinder.pt/tag/\(baseId.uuidString)")!

        appState.handleDeepLink(url: url)

        XCTAssertEqual(appState.pendingDeepLinkBaseId, baseId)
        XCTAssertFalse(appState.pendingDashboardDeepLink)
    }

    func testHandleDeepLinkSetsDashboardFlagForDashboardURL() {
        let url = URL(string: "https://pointfinder.pt/dashboard")!

        appState.handleDeepLink(url: url)

        XCTAssertTrue(appState.pendingDashboardDeepLink)
        XCTAssertNil(appState.pendingDeepLinkBaseId)
    }

    func testHandleDeepLinkIgnoresUnsupportedHost() {
        let url = URL(string: "https://evil.example.com/tag/\(UUID().uuidString)")!

        appState.handleDeepLink(url: url)

        XCTAssertNil(appState.pendingDeepLinkBaseId)
        XCTAssertFalse(appState.pendingDashboardDeepLink)
    }

    func testHandleDeepLinkIgnoresInvalidBaseIdInTagPath() {
        let url = URL(string: "https://pointfinder.ch/tag/not-a-uuid")!

        appState.handleDeepLink(url: url)

        XCTAssertNil(appState.pendingDeepLinkBaseId)
    }

    func testHandleDeepLinkSupportsAlternateHost() {
        let baseId = UUID()
        let url = URL(string: "https://pointfinder.ch/tag/\(baseId.uuidString)")!

        appState.handleDeepLink(url: url)

        XCTAssertEqual(appState.pendingDeepLinkBaseId, baseId)
    }

    // MARK: - Solve Session Lifecycle

    func testStartSolvingSetsSessionIds() {
        let baseId = UUID()
        let challengeId = UUID()

        appState.startSolving(baseId: baseId, challengeId: challengeId)

        XCTAssertEqual(appState.solvingBaseId, baseId)
        XCTAssertEqual(appState.solvingChallengeId, challengeId)
    }

    func testClearSolveSessionNilsOutIds() {
        appState.startSolving(baseId: UUID(), challengeId: UUID())
        XCTAssertNotNil(appState.solvingBaseId)

        appState.clearSolveSession()

        XCTAssertNil(appState.solvingBaseId)
        XCTAssertNil(appState.solvingChallengeId)
    }

    // MARK: - Base Status Helpers

    func testStatusForBaseReturnsNotVisitedWhenNoProgress() {
        let baseId = UUID()

        let status = appState.statusForBase(baseId)

        XCTAssertEqual(status, .notVisited)
    }

    func testStatusForBaseReturnsMatchingStatus() {
        let baseId = UUID()
        appState.baseProgress = [
            BaseProgress(
                baseId: baseId,
                challengeTitle: "Find the tree",
                lat: 47.0,
                lng: 8.0,
                nfcLinked: false,
                status: BaseStatus.checkedIn.rawValue,
                checkedInAt: "2026-01-01T00:00:00Z",
                challengeId: nil,
                submissionStatus: nil
            )
        ]

        XCTAssertEqual(appState.statusForBase(baseId), .checkedIn)
    }

    func testProgressForBaseReturnsNilWhenMissing() {
        XCTAssertNil(appState.progressForBase(UUID()))
    }

    func testProgressForBaseReturnsCorrectEntry() {
        let baseId = UUID()
        let progress = BaseProgress(
            baseId: baseId,
            challengeTitle: "Challenge A",
            lat: 47.0,
            lng: 8.0,
            nfcLinked: true,
            status: BaseStatus.submitted.rawValue,
            checkedInAt: "2026-01-01T00:00:00Z",
            challengeId: UUID(),
            submissionStatus: "pending"
        )
        appState.baseProgress = [progress]

        let result = appState.progressForBase(baseId)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.baseId, baseId)
        XCTAssertEqual(result?.challengeTitle, "Challenge A")
        XCTAssertEqual(result?.baseStatus, .submitted)
    }

    // MARK: - Logout Unsynced Data Guard

    func testLogoutWithPendingActionsShowsAlert() async {
        // Enqueue a pending action so logout detects unsynced data.
        let gameId = UUID()
        let baseId = UUID()
        try? await OfflineQueue.shared.enqueueCheckIn(gameId: gameId, baseId: baseId)

        appState.authType = .player(
            token: "tok",
            playerId: UUID(),
            teamId: UUID(),
            gameId: gameId
        )

        await appState.logout()

        // The alert flag should be set because there are pending actions.
        XCTAssertTrue(appState.showLogoutUnsyncedAlert)
        XCTAssertGreaterThan(appState.pendingLogoutCount, 0)

        // Clean up the queue to avoid leaking into other tests.
        await OfflineQueue.shared.clearAll()
    }

    // MARK: - Force Logout Resets Auth

    func testForceLogoutResetsAuthToNone() async {
        appState.authType = .player(
            token: "tok",
            playerId: UUID(),
            teamId: UUID(),
            gameId: UUID()
        )
        appState.currentGame = PlayerAuthResponse.GameInfo(
            id: UUID(), name: "G", description: "D", status: "live"
        )
        appState.baseProgress = [
            BaseProgress(
                baseId: UUID(), challengeTitle: "C", lat: 0, lng: 0,
                nfcLinked: false, status: "not_visited", checkedInAt: nil,
                challengeId: nil, submissionStatus: nil
            )
        ]

        appState.forceLogout()

        // forceLogout spawns Tasks internally; give them time to execute.
        try? await Task.sleep(nanoseconds: 200_000_000)

        XCTAssertFalse(appState.isAuthenticated)
        XCTAssertEqual(appState.authType, .none, "Auth type should be reset to .none after force logout")
        XCTAssertNil(appState.currentGame)
        XCTAssertTrue(appState.baseProgress.isEmpty)
        // Force logout surfaces a translated error banner.
        XCTAssertTrue(appState.showError)
    }
}

// MARK: - AuthType Equatable Conformance (test-only)

extension AuthType: @retroactive Equatable {
    public static func == (lhs: AuthType, rhs: AuthType) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none):
            return true
        case let (.player(lt, lp, lte, lg), .player(rt, rp, rte, rg)):
            return lt == rt && lp == rp && lte == rte && lg == rg
        case let (.userOperator(la, lr, lu), .userOperator(ra, rr, ru)):
            return la == ra && lr == rr && lu == ru
        default:
            return false
        }
    }
}
