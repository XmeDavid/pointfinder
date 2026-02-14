import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(statusCode: Int, message: String)
    case decodingError(Error)
    case networkError(Error)
    case authExpired

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return Translations.string("apiError.invalidURL")
        case .invalidResponse:
            return Translations.string("apiError.invalidResponse")
        case .httpError(let code, let message):
            return String(format: Translations.string("apiError.httpError"), code, message)
        case .decodingError(let error):
            return String(format: Translations.string("apiError.decodingError"), error.localizedDescription)
        case .networkError(let error):
            return error.localizedDescription
        case .authExpired:
            return Translations.string("apiError.authExpired")
        }
    }
}

actor APIClient {

    private let baseURL: String
    private let session: URLSession
    private let decoder: JSONDecoder

    // MARK: - Token Refresh State

    private var storedRefreshToken: String?
    private var onTokensRefreshed: (@Sendable (String, String, UUID) async -> Void)?
    private var onAuthFailure: (@Sendable () async -> Void)?
    private var isRefreshing = false
    private var refreshWaiters: [CheckedContinuation<String, any Error>] = []

    init(baseURL: String = AppConfiguration.apiBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
    }

    // MARK: - Auth Configuration

    /// Configure automatic token refresh for operator sessions.
    /// - Parameters:
    ///   - refreshToken: The current refresh token
    ///   - onTokensRefreshed: Called with (accessToken, refreshToken, userId) when tokens are refreshed
    func configureOperatorAuth(
        refreshToken: String,
        onTokensRefreshed: @escaping @Sendable (String, String, UUID) async -> Void
    ) {
        self.storedRefreshToken = refreshToken
        self.onTokensRefreshed = onTokensRefreshed
    }

    /// Set a global auth-failure handler used for unrecoverable 401/403 responses.
    func setAuthFailureHandler(_ onAuthFailure: @escaping @Sendable () async -> Void) {
        self.onAuthFailure = onAuthFailure
    }

    func updateRefreshToken(_ token: String) {
        self.storedRefreshToken = token
    }

    func clearAuth() {
        self.storedRefreshToken = nil
        self.onTokensRefreshed = nil
    }

    // MARK: - Auth

    func playerJoin(request: PlayerJoinRequest) async throws -> PlayerAuthResponse {
        try await post("/api/auth/player/join", body: request)
    }

    func operatorLogin(request: OperatorLoginRequest) async throws -> OperatorAuthResponse {
        try await post("/api/auth/login", body: request)
    }

    func getCurrentUser(token: String) async throws -> UserResponse {
        try await get("/api/users/me", token: token)
    }

    // MARK: - Player Endpoints

    func checkIn(gameId: UUID, baseId: UUID, token: String) async throws -> CheckInResponse {
        try await post("/api/player/games/\(gameId)/bases/\(baseId)/check-in",
                       body: EmptyBody(),
                       token: token)
    }

    func getProgress(gameId: UUID, token: String) async throws -> [BaseProgress] {
        try await get("/api/player/games/\(gameId)/progress", token: token)
    }

    func getBases(gameId: UUID, token: String) async throws -> [Base] {
        try await get("/api/player/games/\(gameId)/bases", token: token)
    }

    /// Fetch all game data at once for offline caching
    func getGameData(gameId: UUID, token: String) async throws -> GameDataResponse {
        try await get("/api/player/games/\(gameId)/data", token: token)
    }

    func submitAnswer(gameId: UUID, request: PlayerSubmissionRequest, token: String) async throws -> SubmissionResponse {
        try await post("/api/player/games/\(gameId)/submissions", body: request, token: token)
    }

    func submitAnswerWithFile(
        gameId: UUID,
        baseId: UUID,
        challengeId: UUID,
        imageData: Data,
        notes: String,
        idempotencyKey: UUID? = nil,
        token: String
    ) async throws -> SubmissionResponse {
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = try buildRequest(path: "/api/player/games/\(gameId)/submissions/upload", method: "POST", token: token)
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()

        // file field
        body.appendMultipart(boundary: boundary, name: "file", filename: "photo.jpg", mimeType: "image/jpeg", data: imageData)

        // baseId field
        body.appendMultipart(boundary: boundary, name: "baseId", value: baseId.uuidString)

        // challengeId field
        body.appendMultipart(boundary: boundary, name: "challengeId", value: challengeId.uuidString)

        // answer (notes) field
        body.appendMultipart(boundary: boundary, name: "answer", value: notes)

        // idempotency key field
        if let idempotencyKey {
            body.appendMultipart(boundary: boundary, name: "idempotencyKey", value: idempotencyKey.uuidString)
        }

        // closing boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body
        return try await execute(request)
    }

    func updateLocation(gameId: UUID, lat: Double, lng: Double, token: String) async throws {
        try await postVoid("/api/player/games/\(gameId)/location",
                           body: LocationUpdateBody(lat: lat, lng: lng),
                           token: token)
    }

    func registerPushToken(_ pushToken: String, token: String) async throws {
        try await putVoid("/api/player/push-token",
                          body: PushTokenBody(pushToken: pushToken),
                          token: token)
    }

    func deletePlayerAccount(token: String) async throws {
        try await deleteVoid("/api/player/me", token: token)
    }

    // MARK: - Operator Endpoints

    func getGames(token: String) async throws -> [Game] {
        try await get("/api/games", token: token)
    }

    func getGameBases(gameId: UUID, token: String) async throws -> [Base] {
        try await get("/api/games/\(gameId)/bases", token: token)
    }

    func linkBaseNfc(gameId: UUID, baseId: UUID, token: String) async throws -> Base {
        try await patch("/api/games/\(gameId)/bases/\(baseId)/nfc-link", token: token)
    }

    func getChallenges(gameId: UUID, token: String) async throws -> [Challenge] {
        try await get("/api/games/\(gameId)/challenges", token: token)
    }

    func getAssignments(gameId: UUID, token: String) async throws -> [Assignment] {
        try await get("/api/games/\(gameId)/assignments", token: token)
    }

    // MARK: - Operator Monitoring Endpoints

    func getTeams(gameId: UUID, token: String) async throws -> [Team] {
        try await get("/api/games/\(gameId)/teams", token: token)
    }

    func getTeamLocations(gameId: UUID, token: String) async throws -> [TeamLocationResponse] {
        try await get("/api/games/\(gameId)/monitoring/locations", token: token)
    }

    func getTeamProgress(gameId: UUID, token: String) async throws -> [TeamBaseProgressResponse] {
        try await get("/api/games/\(gameId)/monitoring/progress", token: token)
    }

    // MARK: - HTTP Methods

    private func get<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "GET", token: token)
        return try await execute(request)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B, token: String? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "POST", token: token)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func postVoid<B: Encodable>(_ path: String, body: B, token: String? = nil) async throws {
        var request = try buildRequest(path: path, method: "POST", token: token)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        try await executeVoid(request)
    }

    private func put<T: Decodable, B: Encodable>(_ path: String, body: B, token: String? = nil) async throws -> T {
        var request = try buildRequest(path: path, method: "PUT", token: token)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await execute(request)
    }

    private func putVoid<B: Encodable>(_ path: String, body: B, token: String? = nil) async throws {
        var request = try buildRequest(path: path, method: "PUT", token: token)
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        try await executeVoid(request)
    }

    private func patch<T: Decodable>(_ path: String, token: String? = nil) async throws -> T {
        let request = try buildRequest(path: path, method: "PATCH", token: token)
        return try await execute(request)
    }

    private func deleteVoid(_ path: String, token: String? = nil) async throws {
        let request = try buildRequest(path: path, method: "DELETE", token: token)
        try await executeVoid(request)
    }

    // MARK: - Helpers

    private func buildRequest(path: String, method: String, token: String?) throws -> URLRequest {
        guard let url = URL(string: baseURL + path) else {
            throw APIError.invalidURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30

        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let isAuthRequest = request.value(forHTTPHeaderField: "Authorization") != nil
            let isAuthFailureStatus = httpResponse.statusCode == 401 || httpResponse.statusCode == 403

            // If 401/403 on an authenticated request and we have a refresh token, attempt refresh.
            if isAuthFailureStatus, isAuthRequest, storedRefreshToken != nil {
                let newAccessToken = try await getRefreshedAccessToken()

                // Retry with the new token
                var retryRequest = request
                retryRequest.setValue("Bearer \(newAccessToken)", forHTTPHeaderField: "Authorization")
                return try await executeWithoutRetry(retryRequest)
            }

            // Player sessions do not refresh tokens. Treat 401/403 as auth-expired.
            if isAuthFailureStatus, isAuthRequest {
                await onAuthFailure?()
                throw APIError.authExpired
            }

            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    private func executeVoid(_ request: URLRequest) async throws {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let isAuthRequest = request.value(forHTTPHeaderField: "Authorization") != nil
            let isAuthFailureStatus = httpResponse.statusCode == 401 || httpResponse.statusCode == 403

            if isAuthFailureStatus, isAuthRequest, storedRefreshToken != nil {
                let newAccessToken = try await getRefreshedAccessToken()
                var retryRequest = request
                retryRequest.setValue("Bearer \(newAccessToken)", forHTTPHeaderField: "Authorization")
                try await executeVoidWithoutRetry(retryRequest)
                return
            }

            if isAuthFailureStatus, isAuthRequest {
                await onAuthFailure?()
                throw APIError.authExpired
            }

            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }
    }

    // MARK: - Token Refresh

    /// Refreshes the access token, queuing concurrent callers so only one refresh happens at a time.
    private func getRefreshedAccessToken() async throws -> String {
        // If a refresh is already in progress, wait for it
        if isRefreshing {
            return try await withCheckedThrowingContinuation { continuation in
                refreshWaiters.append(continuation)
            }
        }

        isRefreshing = true

        do {
            guard let refreshToken = storedRefreshToken else {
                throw APIError.authExpired
            }

            var request = try buildRequest(path: "/api/auth/refresh", method: "POST", token: nil)
            request.httpBody = try JSONEncoder().encode(RefreshTokenBody(refreshToken: refreshToken))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let (data, response) = try await session.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  (200...299).contains(httpResponse.statusCode) else {
                throw APIError.authExpired
            }

            let authResponse = try decoder.decode(OperatorAuthResponse.self, from: data)

            // Update stored refresh token for next cycle
            storedRefreshToken = authResponse.refreshToken

            // Notify AppState of new tokens
            await onTokensRefreshed?(authResponse.accessToken, authResponse.refreshToken, authResponse.user.id)

            // Resume all queued requests with the new access token
            let newToken = authResponse.accessToken
            for waiter in refreshWaiters {
                waiter.resume(returning: newToken)
            }
            refreshWaiters.removeAll()
            isRefreshing = false

            return newToken
        } catch {
            // Refresh failed — session is unrecoverable
            storedRefreshToken = nil
            await onAuthFailure?()

            for waiter in refreshWaiters {
                waiter.resume(throwing: APIError.authExpired)
            }
            refreshWaiters.removeAll()
            isRefreshing = false

            throw APIError.authExpired
        }
    }

    /// Execute a request without token-refresh retry (used for the retry after refresh to avoid infinite loops).
    private func executeWithoutRetry<T: Decodable>(_ request: URLRequest) async throws -> T {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if (httpResponse.statusCode == 401 || httpResponse.statusCode == 403),
               request.value(forHTTPHeaderField: "Authorization") != nil {
                await onAuthFailure?()
                throw APIError.authExpired
            }
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    private func executeVoidWithoutRetry(_ request: URLRequest) async throws {
        let data: Data
        let response: URLResponse

        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            if (httpResponse.statusCode == 401 || httpResponse.statusCode == 403),
               request.value(forHTTPHeaderField: "Authorization") != nil {
                await onAuthFailure?()
                throw APIError.authExpired
            }
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.httpError(statusCode: httpResponse.statusCode, message: message)
        }
    }
}

// MARK: - Helper Types

private struct EmptyBody: Encodable {}

private struct RefreshTokenBody: Encodable {
    let refreshToken: String
}

private struct LocationUpdateBody: Encodable {
    let lat: Double
    let lng: Double
}

private struct PushTokenBody: Encodable {
    let pushToken: String
}

// MARK: - Multipart Helpers

extension Data {
    mutating func appendMultipart(boundary: String, name: String, value: String) {
        let field = "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n"
        append(field.data(using: .utf8)!)
    }

    mutating func appendMultipart(boundary: String, name: String, filename: String, mimeType: String, data: Data) {
        var header = "--\(boundary)\r\n"
        header += "Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n"
        header += "Content-Type: \(mimeType)\r\n\r\n"
        append(header.data(using: .utf8)!)
        append(data)
        append("\r\n".data(using: .utf8)!)
    }
}
