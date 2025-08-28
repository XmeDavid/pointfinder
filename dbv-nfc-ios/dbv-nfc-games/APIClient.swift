//
//  APIClient.swift
//  dbv-nfc-games
//
//  Minimal API client stubs for backend integration.
//

import Foundation

enum APIError: Error {
    case invalidURL
    case network(Error)
    case decoding(Error)
    case server(statusCode: Int, message: String?)
    case unauthorized
}

struct APIClient {
    let baseURL: URL
    let urlSession: URLSession

    init(baseURL: URL, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
    }

    // MARK: - Auth

    func joinTeam(joinCode: String, deviceId: String) async throws -> (token: String, team: Team) {
        struct JoinBody: Encodable { let code: String; let deviceId: String }
        struct JoinResponse: Decodable { let token: String; let team: Team }
        let req = try makeRequest(path: "/auth/team/join", method: "POST", body: JoinBody(code: joinCode, deviceId: deviceId), token: nil)
        let res: JoinResponse = try await send(req)
        return (res.token, res.team)
    }

    func adminLogin(username: String, password: String) async throws -> String {
        struct Body: Encodable { let username: String; let password: String }
        struct Res: Decodable { let token: String }
        let req = try makeRequest(path: "/auth/admin/login", method: "POST", body: Body(username: username, password: password), token: nil)
        let res: Res = try await send(req)
        return res.token
    }

    // MARK: - Games

    func fetchGame(id: GameID, token: String) async throws -> Game {
        let req = try makeRequest(path: "/games/\(id)", method: "GET", body: Optional<Int>.none as Int?, token: token)
        let res: Game = try await send(req)
        return res
    }

    // MARK: - Teams Progress

    struct TapEvent: Codable {
        let baseId: BaseID
        let tagUUID: String
        let action: String // "arrived" or "completed"
        let timestamp: Date
    }

    func postProgress(teamId: TeamID, tap: TapEvent, token: String) async throws {
        let req = try makeRequest(path: "/teams/\(teamId)/progress", method: "POST", body: tap, token: token)
        let _: EmptyResponse = try await send(req)
    }

    // MARK: - Events (location, telemetry, admin actions)

    struct AppEvent: Encodable {
        let type: String
        let details: [String: String]
        let timestamp: Date
    }

    func postEvent(_ event: AppEvent, token: String) async throws {
        let req = try makeRequest(path: "/events", method: "POST", body: event, token: token)
        let _: EmptyResponse = try await send(req)
    }

    // Admin: update game bases after NFC write
    func updateGameBases(gameId: GameID, bases: [GameBase], token: String) async throws {
        struct Body: Encodable { let bases: [GameBase] }
        let req = try makeRequest(path: "/games/\(gameId)", method: "PATCH", body: Body(bases: bases), token: token)
        let _: EmptyResponse = try await send(req)
    }

    // MARK: - Internals

    private func makeRequest<T: Encodable>(path: String, method: String, body: T?, token: String?) throws -> URLRequest {
        let normalizedPath: String
        if path.hasPrefix("/api") {
            normalizedPath = path
        } else if path.hasPrefix("/") {
            normalizedPath = "/api" + path
        } else {
            normalizedPath = "/api/" + path
        }
        guard let url = URL(string: normalizedPath, relativeTo: baseURL) else { throw APIError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body = body { request.httpBody = try JSONEncoder().encode(body) }
        return request
    }

    private func send<R: Decodable>(_ request: URLRequest) async throws -> R {
        do {
            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.server(statusCode: -1, message: "No HTTP response")
            }
            switch http.statusCode {
            case 200...299:
                if R.self == EmptyResponse.self { return EmptyResponse() as! R }
                do {
                    return try JSONDecoder().decode(R.self, from: data)
                } catch {
                    throw APIError.decoding(error)
                }
            case 401:
                throw APIError.unauthorized
            default:
                let msg = String(data: data, encoding: .utf8)
                throw APIError.server(statusCode: http.statusCode, message: msg)
            }
        } catch {
            if let apiErr = error as? APIError { throw apiErr }
            throw APIError.network(error)
        }
    }

    private struct EmptyResponse: Decodable { }
}


