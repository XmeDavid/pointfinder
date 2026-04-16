import Foundation
import Testing
@testable import dbv_nfc_games

/// Tests for `AppState.handleDeepLink(url:)`.
///
/// Ensures the native app catches both `/tag/<uuid>` (NFC landing page)
/// and `/dashboard` (email invite universal link) URLs without
/// accidentally routing one through the other's pipeline.
@MainActor
struct DeepLinkTests {

    // MARK: - /tag/ deep links

    @Test func tagDeepLinkSetsPendingBaseId() async throws {
        let appState = AppState()
        let baseId = UUID()
        let url = URL(string: "https://pointfinder.pt/tag/\(baseId.uuidString.lowercased())")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDeepLinkBaseId == baseId)
        #expect(appState.pendingDashboardDeepLink == false)
    }

    @Test func tagDeepLinkIgnoresUnknownHost() async throws {
        let appState = AppState()
        let baseId = UUID()
        let url = URL(string: "https://example.com/tag/\(baseId.uuidString.lowercased())")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDeepLinkBaseId == nil)
        #expect(appState.pendingDashboardDeepLink == false)
    }

    @Test func tagDeepLinkIgnoresMalformedUuid() async throws {
        let appState = AppState()
        let url = URL(string: "https://pointfinder.ch/tag/not-a-uuid")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDeepLinkBaseId == nil)
    }

    // MARK: - /dashboard deep links (email invite)

    @Test func dashboardDeepLinkSetsPendingInviteFlag() async throws {
        let appState = AppState()
        let url = URL(string: "https://pointfinder.pt/dashboard")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDashboardDeepLink == true)
        #expect(appState.pendingDeepLinkBaseId == nil)
    }

    @Test func dashboardDeepLinkWorksForChHost() async throws {
        let appState = AppState()
        let url = URL(string: "https://pointfinder.ch/dashboard")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDashboardDeepLink == true)
    }

    @Test func dashboardDeepLinkIgnoresUnknownHost() async throws {
        let appState = AppState()
        let url = URL(string: "https://malicious.example/dashboard")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDashboardDeepLink == false)
    }

    /// Legacy invite emails (and future consumers) may still include a
    /// query parameter. Ensure the handler tolerates it — we just care
    /// that the /dashboard path was matched; the query string is ignored
    /// because the backend's accept endpoint operates on inviteId not
    /// a URL-embedded code.
    @Test func dashboardDeepLinkWithQueryStillSetsFlag() async throws {
        let appState = AppState()
        let url = URL(string: "https://pointfinder.pt/dashboard?invite=ABC123")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDashboardDeepLink == true)
    }

    @Test func dashboardDeepLinkDoesNotSetBaseId() async throws {
        let appState = AppState()
        let url = URL(string: "https://pointfinder.pt/dashboard")!

        appState.handleDeepLink(url: url)

        #expect(appState.pendingDeepLinkBaseId == nil)
    }
}
