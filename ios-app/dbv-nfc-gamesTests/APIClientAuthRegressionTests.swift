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

    private func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
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

private final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        guard let handler = Self.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

