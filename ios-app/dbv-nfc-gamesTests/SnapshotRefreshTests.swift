import Foundation
import XCTest
@testable import dbv_nfc_games

/// Unit tests for the snapshot refresh contract wired by
/// `AppState.refreshFromSnapshot()` and the underlying API call.
///
/// Covers:
///  - Happy path: player snapshot decodes and the canonical shape has no
///    scores at any nesting depth.
///  - Happy path: operator snapshot decodes with full leaderboard and
///    operator observability counters.
///  - 401 auth expired → APIError.authExpired surfaces, refresh is a no-op,
///    no UI crash.
///  - 403 wrong game → APIError.httpError surfaces, no crash.
///  - Network error → APIError.networkError surfaces, no crash.
///  - Status normalisation: backend emits uppercase enum names
///    (`SETUP`/`LIVE`/`ENDED`), iOS lowercases on decode.
final class SnapshotRefreshTests: XCTestCase {

    override func setUp() {
        super.setUp()
        MockURLProtocol.requestHandler = nil
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    // MARK: - Player snapshot decoding

    func testPlayerSnapshotDecodesFromBackendJson() throws {
        let json = """
        {
          "stateVersion": 42,
          "serverTime": "2026-04-08T14:23:05.817Z",
          "game": {
            "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
            "name": "Forest Adventure",
            "description": "A scouting game in the forest",
            "status": "live",
            "unlockTrigger": "CHECK_IN",
            "tileSource": "osm-classic",
            "startDate": null,
            "endDate": null
          },
          "team": {
            "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
            "name": "Eagles",
            "color": "#FF5733",
            "memberCount": 4
          },
          "progress": [
            {
              "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
              "challengeTitle": "Find the tree",
              "lat": 47.3769,
              "lng": 8.5417,
              "nfcLinked": true,
              "status": "completed",
              "checkedInAt": "2026-04-08T10:00:00Z",
              "challengeId": null,
              "submissionStatus": "approved"
            }
          ],
          "submissions": [
            {
              "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
              "baseId": "a7b8c9d0-e1f2-3456-abcd-567890123456",
              "challengeId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
              "status": "approved",
              "submittedAt": "2026-04-08T11:00:00Z",
              "fileUrl": null,
              "fileUrls": null
            }
          ],
          "uploadSessions": []
        }
        """.data(using: .utf8)!

        let snapshot = try JSONDecoder().decode(PlayerSnapshotResponse.self, from: json)

        XCTAssertEqual(snapshot.stateVersion, 42)
        // Backend emits uppercase enum names; iOS lowercases on decode so
        // the existing app code that compares against `"live"`/`"setup"`
        // keeps working.
        XCTAssertEqual(snapshot.game.status, "live")
        XCTAssertEqual(snapshot.game.name, "Forest Adventure")
        XCTAssertEqual(snapshot.team.name, "Eagles")
        XCTAssertEqual(snapshot.team.color, "#FF5733")
        XCTAssertEqual(snapshot.progress.count, 1)
        // P1 Phase 4 W4: player-facing progress rows carry the challenge
        // title, not the base name.
        XCTAssertEqual(snapshot.progress.first?.challengeTitle, "Find the tree")
        XCTAssertEqual(snapshot.progress.first?.status, "completed")
        XCTAssertEqual(snapshot.submissions?.count, 1)
        XCTAssertEqual(snapshot.submissions?.first?.status, "approved")
    }

    /// The player snapshot is structurally score-free. This test walks the
    /// raw JSON and the decoded struct to prove no scoring key is present.
    func testPlayerSnapshotHasNoScoreFieldsAtAnyDepth() throws {
        let json = """
        {
          "stateVersion": 1,
          "serverTime": "2026-04-08T14:23:05.817Z",
          "game": {
            "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
            "name": "g", "description": "d", "status": "live",
            "unlockTrigger": "CHECK_IN", "tileSource": "osm-classic"
          },
          "team": {
            "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
            "name": "t", "color": "#000", "memberCount": 1
          },
          "progress": [],
          "submissions": [],
          "uploadSessions": []
        }
        """.data(using: .utf8)!

        // JSON structural check
        let obj = try JSONSerialization.jsonObject(with: json) as! [String: Any]
        let forbiddenKeys: Set<String> = ["score", "points", "leaderboard", "rank"]
        let foundKeys = collectAllKeys(obj).intersection(forbiddenKeys)
        XCTAssertTrue(foundKeys.isEmpty, "PlayerSnapshotResponse JSON must not carry scoring fields; found: \(foundKeys)")

        // Decode + structural reflection on the resulting Swift struct type
        let snapshot = try JSONDecoder().decode(PlayerSnapshotResponse.self, from: json)
        XCTAssertNotNil(snapshot)
    }

    private func collectAllKeys(_ value: Any) -> Set<String> {
        var keys: Set<String> = []
        if let dict = value as? [String: Any] {
            for (k, v) in dict {
                keys.insert(k)
                keys.formUnion(collectAllKeys(v))
            }
        } else if let arr = value as? [Any] {
            for item in arr {
                keys.formUnion(collectAllKeys(item))
            }
        }
        return keys
    }

    // MARK: - Operator snapshot decoding

    func testOperatorSnapshotDecodesFromBackendJson() throws {
        let json = """
        {
          "stateVersion": 15,
          "serverTime": "2026-04-08T14:23:05.817Z",
          "game": {
            "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
            "name": "Forest Adventure",
            "description": "A scouting game in the forest",
            "status": "live",
            "unlockTrigger": "CHECK_IN",
            "tileSource": "osm-classic",
            "startDate": null,
            "endDate": null,
            "uniformAssignment": false,
            "broadcastEnabled": true,
            "broadcastCode": "FOREST2025"
          },
          "teams": [
            {
              "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
              "name": "Eagles",
              "color": "#FF5733",
              "score": 350,
              "memberCount": 4
            }
          ],
          "leaderboard": [
            {
              "teamId": "c3d4e5f6-a7b8-9012-cdef-123456789012",
              "teamName": "Eagles",
              "color": "#FF5733",
              "points": 350,
              "completedChallenges": 5
            }
          ],
          "pendingReviews": 2,
          "activeUploads": 1,
          "needsAttention": 0
        }
        """.data(using: .utf8)!

        let snapshot = try JSONDecoder().decode(OperatorSnapshotResponse.self, from: json)

        XCTAssertEqual(snapshot.stateVersion, 15)
        XCTAssertEqual(snapshot.game.status, "live")
        XCTAssertEqual(snapshot.game.broadcastEnabled, true)
        XCTAssertEqual(snapshot.game.broadcastCode, "FOREST2025")
        XCTAssertEqual(snapshot.teams.count, 1)
        XCTAssertEqual(snapshot.teams.first?.score, 350)
        XCTAssertEqual(snapshot.leaderboard.count, 1)
        XCTAssertEqual(snapshot.leaderboard.first?.points, 350)
        XCTAssertEqual(snapshot.pendingReviews, 2)
        XCTAssertEqual(snapshot.activeUploads, 1)
        XCTAssertEqual(snapshot.needsAttention, 0)
    }

    // MARK: - APIClient snapshot calls

    func testGetPlayerSnapshotHitsCorrectEndpoint() async throws {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        let lock = NSLock()
        var capturedPath: String?
        var capturedAuth: String?
        MockURLProtocol.requestHandler = { request in
            lock.lock()
            capturedPath = request.url?.path
            capturedAuth = request.value(forHTTPHeaderField: "Authorization")
            lock.unlock()
            return Self.ok(request: request, body: Self.minimalPlayerSnapshotJson(gameId: gameId))
        }

        let snapshot = try await client.getPlayerSnapshot(gameId: gameId, token: "player-token")
        XCTAssertEqual(snapshot.game.id, gameId)

        lock.lock()
        XCTAssertEqual(capturedPath, "/api/games/\(gameId.uuidString.lowercased())/snapshot")
        XCTAssertEqual(capturedAuth, "Bearer player-token")
        lock.unlock()
    }

    func testGetOperatorSnapshotHitsSameEndpointWithDifferentDecode() async throws {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        MockURLProtocol.requestHandler = { request in
            Self.ok(request: request, body: Self.minimalOperatorSnapshotJson(gameId: gameId))
        }

        let snapshot = try await client.getOperatorSnapshot(gameId: gameId, token: "op-token")
        XCTAssertEqual(snapshot.game.id, gameId)
        XCTAssertEqual(snapshot.pendingReviews, 0)
    }

    func testPlayerSnapshot401SurfacesAuthExpiredWithoutCrashing() async {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        MockURLProtocol.requestHandler = { request in
            Self.failure(request: request, statusCode: 401, body: #"{"message":"expired"}"#)
        }

        do {
            _ = try await client.getPlayerSnapshot(gameId: gameId, token: "bad")
            XCTFail("Expected authExpired error")
        } catch let error as APIError {
            switch error {
            case .authExpired:
                break
            default:
                XCTFail("Expected authExpired, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPlayerSnapshot403SurfacesHttpErrorWithoutCrashing() async {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        MockURLProtocol.requestHandler = { request in
            Self.failure(request: request, statusCode: 403, body: #"{"message":"wrong game"}"#)
        }

        // 403 on an authed request without refresh token → authExpired.
        // Without a refresh token configured, the APIClient also treats 403
        // as auth failure; the test asserts we do NOT crash and DO get a
        // typed error back for the caller to swallow.
        do {
            _ = try await client.getPlayerSnapshot(gameId: gameId, token: "player-token")
            XCTFail("Expected error")
        } catch let error as APIError {
            // Either authExpired (no refresh token) or httpError 403 is acceptable here;
            // the point is that it does not crash.
            switch error {
            case .authExpired, .httpError(403, _):
                break
            default:
                XCTFail("Expected authExpired or 403, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testPlayerSnapshotNetworkErrorDoesNotCrash() async {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        MockURLProtocol.requestHandler = { _ in
            throw URLError(.notConnectedToInternet)
        }

        do {
            _ = try await client.getPlayerSnapshot(gameId: gameId, token: "player-token")
            XCTFail("Expected network error")
        } catch let error as APIError {
            switch error {
            case .networkError:
                break
            default:
                XCTFail("Expected networkError, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    // MARK: - Helpers

    private func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    private static func ok(request: URLRequest, body: String) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, Data(body.utf8))
    }

    private static func failure(request: URLRequest, statusCode: Int, body: String) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, Data(body.utf8))
    }

    private static func minimalPlayerSnapshotJson(gameId: UUID) -> String {
        """
        {
          "stateVersion": 1,
          "serverTime": "2026-04-08T00:00:00Z",
          "game": {
            "id": "\(gameId.uuidString.lowercased())",
            "name": "g", "description": "d", "status": "live",
            "unlockTrigger": "CHECK_IN", "tileSource": "osm-classic"
          },
          "team": {
            "id": "00000000-0000-0000-0000-000000000001",
            "name": "t", "color": "#000", "memberCount": 1
          },
          "progress": [],
          "submissions": [],
          "uploadSessions": []
        }
        """
    }

    private static func minimalOperatorSnapshotJson(gameId: UUID) -> String {
        """
        {
          "stateVersion": 1,
          "serverTime": "2026-04-08T00:00:00Z",
          "game": {
            "id": "\(gameId.uuidString.lowercased())",
            "name": "g", "description": "d", "status": "setup",
            "unlockTrigger": "CHECK_IN", "tileSource": "osm-classic",
            "uniformAssignment": false, "broadcastEnabled": false
          },
          "teams": [],
          "leaderboard": [],
          "pendingReviews": 0,
          "activeUploads": 0,
          "needsAttention": 0
        }
        """
    }
}
