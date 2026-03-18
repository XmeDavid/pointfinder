import Foundation
import XCTest
@testable import dbv_nfc_games

final class APIClientAuthRegressionTests: XCTestCase {

    override func setUp() {
        super.setUp()
        MockURLProtocol.requestHandler = nil
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func testOperatorRequestRefreshesTokenAndRetries() async throws {
        let userId = UUID()
        let tokenStore = TokenStore()
        let authFailureStore = AuthFailureStore()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        await client.configureOperatorAuth(
            refreshToken: "refresh-old",
            onTokensRefreshed: { accessToken, refreshToken, refreshedUserId in
                await tokenStore.store(accessToken: accessToken, refreshToken: refreshToken, userId: refreshedUserId)
            }
        )
        await client.setAuthFailureHandler {
            await authFailureStore.markTriggered()
        }

        let lock = NSLock()
        var gamesRequestCount = 0
        MockURLProtocol.requestHandler = { request in
            let path = request.url?.path ?? ""
            switch path {
            case "/api/games":
                let auth = request.value(forHTTPHeaderField: "Authorization")
                lock.lock()
                gamesRequestCount += 1
                let currentCount = gamesRequestCount
                lock.unlock()

                if auth == "Bearer expired-access" && currentCount == 1 {
                    return Self.httpResponse(
                        request: request,
                        statusCode: 401,
                        jsonBody: "{\"message\":\"expired\"}"
                    )
                }
                if auth == "Bearer fresh-access" {
                    return Self.httpResponse(
                        request: request,
                        statusCode: 200,
                        jsonBody: "[]"
                    )
                }
                return Self.httpResponse(
                    request: request,
                    statusCode: 403,
                    jsonBody: "{\"message\":\"unexpected auth header\"}"
                )
            case "/api/auth/refresh":
                return Self.httpResponse(
                    request: request,
                    statusCode: 200,
                    jsonBody: """
                    {"accessToken":"fresh-access","refreshToken":"fresh-refresh","user":{"id":"\(userId.uuidString)","name":"Operator","email":"operator@example.com","role":"operator"}}
                    """
                )
            default:
                return Self.httpResponse(
                    request: request,
                    statusCode: 404,
                    jsonBody: "{\"message\":\"not found\"}"
                )
            }
        }

        let games = try await client.getGames(token: "expired-access")
        XCTAssertTrue(games.isEmpty)
        XCTAssertEqual(gamesRequestCount, 2)

        let refreshed = await tokenStore.snapshot()
        XCTAssertEqual(refreshed?.accessToken, "fresh-access")
        XCTAssertEqual(refreshed?.refreshToken, "fresh-refresh")
        XCTAssertEqual(refreshed?.userId, userId)
        let didTriggerAfterSuccess = await authFailureStore.triggered()
        XCTAssertFalse(didTriggerAfterSuccess)
    }

    func testRefreshFailureTriggersAuthFailureHandler() async {
        let authFailureStore = AuthFailureStore()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)

        await client.configureOperatorAuth(
            refreshToken: "refresh-old",
            onTokensRefreshed: { _, _, _ in }
        )
        await client.setAuthFailureHandler {
            await authFailureStore.markTriggered()
        }

        MockURLProtocol.requestHandler = { request in
            let path = request.url?.path ?? ""
            if path == "/api/games" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 401,
                    jsonBody: "{\"message\":\"expired\"}"
                )
            }
            if path == "/api/auth/refresh" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 401,
                    jsonBody: "{\"message\":\"refresh failed\"}"
                )
            }
            return Self.httpResponse(
                request: request,
                statusCode: 404,
                jsonBody: "{\"message\":\"not found\"}"
            )
        }

        do {
            _ = try await client.getGames(token: "expired-access")
            XCTFail("Expected authExpired error")
        } catch let error as APIError {
            switch error {
            case .authExpired:
                break
            default:
                XCTFail("Expected authExpired, got \(error)")
            }
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }

        let didTriggerAfterFailure = await authFailureStore.triggered()
        XCTAssertTrue(didTriggerAfterFailure)
    }

    func testGameVariableRoutesUseTeamVariableEndpoints() async throws {
        let gameId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)
        let requestPayload = TeamVariablesRequest(
            variables: [
                TeamVariable(key: "greeting", teamValues: ["team-1": "hello"])
            ]
        )

        let lock = NSLock()
        var capturedRequests: [(path: String, method: String, body: Data?)] = []

        MockURLProtocol.requestHandler = { request in
            lock.lock()
            capturedRequests.append((request.url?.path ?? "", request.httpMethod ?? "", Self.requestBody(from: request)))
            lock.unlock()

            if request.url?.path == "/api/games/\(gameId)/team-variables", request.httpMethod == "GET" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 200,
                    jsonBody: #"{"variables":[]}"#
                )
            }

            if request.url?.path == "/api/games/\(gameId)/team-variables", request.httpMethod == "PUT" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 200,
                    jsonBody: #"{"variables":[{"key":"greeting","teamValues":{"team-1":"hello"}}]}"#
                )
            }

            return Self.httpResponse(
                request: request,
                statusCode: 404,
                jsonBody: #"{"message":"not found"}"#
            )
        }

        _ = try await client.getGameVariables(gameId: gameId, token: "token")
        _ = try await client.saveGameVariables(gameId: gameId, request: requestPayload, token: "token")

        lock.lock()
        let requests = capturedRequests
        lock.unlock()

        XCTAssertEqual(requests.filter { $0.path == "/api/games/\(gameId)/team-variables" && $0.method == "GET" }.count, 1)
        XCTAssertEqual(requests.filter { $0.path == "/api/games/\(gameId)/team-variables" && $0.method == "PUT" }.count, 1)

        let body = try XCTUnwrap(requests.first { $0.method == "PUT" }?.body)
        let decoded = try JSONDecoder().decode(TeamVariablesRequest.self, from: body)
        XCTAssertEqual(decoded.variables, requestPayload.variables)
    }

    func testChallengeVariableRoutesUseChallengeTeamVariableEndpoints() async throws {
        let gameId = UUID()
        let challengeId = UUID()
        let session = makeSession()
        let client = APIClient(baseURL: "https://example.test", session: session)
        let requestPayload = TeamVariablesRequest(
            variables: [
                TeamVariable(key: "hint", teamValues: ["team-2": "north"])
            ]
        )

        let lock = NSLock()
        var capturedRequests: [(path: String, method: String, body: Data?)] = []

        MockURLProtocol.requestHandler = { request in
            lock.lock()
            capturedRequests.append((request.url?.path ?? "", request.httpMethod ?? "", Self.requestBody(from: request)))
            lock.unlock()

            if request.url?.path == "/api/games/\(gameId)/challenges/\(challengeId)/team-variables", request.httpMethod == "GET" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 200,
                    jsonBody: #"{"variables":[]}"#
                )
            }

            if request.url?.path == "/api/games/\(gameId)/challenges/\(challengeId)/team-variables", request.httpMethod == "PUT" {
                return Self.httpResponse(
                    request: request,
                    statusCode: 200,
                    jsonBody: #"{"variables":[{"key":"hint","teamValues":{"team-2":"north"}}]}"#
                )
            }

            return Self.httpResponse(
                request: request,
                statusCode: 404,
                jsonBody: #"{"message":"not found"}"#
            )
        }

        _ = try await client.getChallengeVariables(gameId: gameId, challengeId: challengeId, token: "token")
        _ = try await client.saveChallengeVariables(gameId: gameId, challengeId: challengeId, request: requestPayload, token: "token")

        lock.lock()
        let requests = capturedRequests
        lock.unlock()

        XCTAssertEqual(requests.filter { $0.path == "/api/games/\(gameId)/challenges/\(challengeId)/team-variables" && $0.method == "GET" }.count, 1)
        XCTAssertEqual(requests.filter { $0.path == "/api/games/\(gameId)/challenges/\(challengeId)/team-variables" && $0.method == "PUT" }.count, 1)

        let body = try XCTUnwrap(requests.first { $0.method == "PUT" }?.body)
        let decoded = try JSONDecoder().decode(TeamVariablesRequest.self, from: body)
        XCTAssertEqual(decoded.variables, requestPayload.variables)
    }

    private func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    private static func requestBody(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }

        guard let stream = request.httpBodyStream else {
            return nil
        }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)

        while stream.hasBytesAvailable {
            let read = stream.read(&buffer, maxLength: buffer.count)
            if read < 0 {
                return nil
            }
            if read == 0 {
                break
            }
            data.append(buffer, count: read)
        }

        return data.isEmpty ? nil : data
    }

    private static func httpResponse(
        request: URLRequest,
        statusCode: Int,
        jsonBody: String
    ) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://example.test")!,
            statusCode: statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, Data(jsonBody.utf8))
    }
}

private actor TokenStore {
    private var current: (accessToken: String, refreshToken: String, userId: UUID)?

    func store(accessToken: String, refreshToken: String, userId: UUID) {
        current = (accessToken, refreshToken, userId)
    }

    func snapshot() -> (accessToken: String, refreshToken: String, userId: UUID)? {
        current
    }
}

private actor AuthFailureStore {
    private var didTrigger = false

    func markTriggered() {
        didTrigger = true
    }

    func triggered() -> Bool {
        didTrigger
    }
}
