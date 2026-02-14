import Foundation
import os

@MainActor
final class MobileRealtimeClient {
    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case reconnecting(attempt: Int)
    }

    var onEvent: (([String: Any]) -> Void)?
    var onConnectionStateChange: ((ConnectionState) -> Void)?

    private let urlSession = URLSession(configuration: .default)
    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var desiredSession: DesiredSession?
    private var reconnectAttempt = 0
    private let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.prayer.pointfinder",
        category: "MobileRealtime"
    )

    private(set) var connectionState: ConnectionState = .disconnected {
        didSet {
            self.onConnectionStateChange?(self.connectionState)
            self.logger.info("Realtime state changed: \(String(describing: self.connectionState), privacy: .public)")
        }
    }

    func connect(gameId: UUID, token: String) {
        guard AppConfiguration.mobileRealtimeEnabled else {
            connectionState = .disconnected
            return
        }
        let desired = DesiredSession(gameId: gameId, token: token)
        if desiredSession == desired && connectionState == .connected {
            return
        }

        desiredSession = desired
        reconnectAttempt = 0
        reconnectTask?.cancel()
        openConnection()
    }

    func disconnect() {
        desiredSession = nil
        reconnectAttempt = 0
        reconnectTask?.cancel()
        reconnectTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        socketTask?.cancel(with: .normalClosure, reason: nil)
        socketTask = nil
        connectionState = .disconnected
    }

    private func openConnection() {
        guard let desiredSession else {
            connectionState = .disconnected
            return
        }

        connectionState = reconnectAttempt == 0 ? .connecting : .reconnecting(attempt: reconnectAttempt)

        receiveTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)

        guard let request = buildRequest(session: desiredSession) else {
            connectionState = .disconnected
            return
        }

        let task = urlSession.webSocketTask(with: request)
        socketTask = task
        task.resume()
        connectionState = .connected
        startReceiveLoop(task: task)
    }

    private func startReceiveLoop(task: URLSessionWebSocketTask) {
        receiveTask = Task { [weak self] in
            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    await self?.handleMessage(message)
                } catch {
                    await self?.handleDisconnect()
                    break
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data?
        switch message {
        case .string(let text):
            data = text.data(using: .utf8)
        case .data(let binary):
            data = binary
        @unknown default:
            data = nil
        }

        guard let data,
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return
        }
        onEvent?(raw)
    }

    private func handleDisconnect() {
        socketTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        scheduleReconnectIfNeeded()
    }

    private func scheduleReconnectIfNeeded() {
        guard desiredSession != nil else {
            connectionState = .disconnected
            return
        }
        guard reconnectTask == nil || reconnectTask?.isCancelled == true else {
            return
        }

        reconnectTask = Task { [weak self] in
            guard let self else { return }
            defer { self.reconnectTask = nil }
            self.reconnectAttempt += 1
            self.connectionState = .reconnecting(attempt: self.reconnectAttempt)
            let cappedExponent = min(self.reconnectAttempt, 5)
            let backoffSeconds = min(30, 1 << cappedExponent)
            try? await Task.sleep(nanoseconds: UInt64(backoffSeconds) * 1_000_000_000)
            guard !Task.isCancelled else { return }
            self.openConnection()
        }
    }

    private func buildRequest(session: DesiredSession) -> URLRequest? {
        guard let base = URL(string: AppConfiguration.apiBaseURL),
              var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            return nil
        }

        components.scheme = base.scheme == "https" ? "wss" : "ws"
        components.path = "/ws/mobile"
        components.queryItems = [
            URLQueryItem(name: "gameId", value: session.gameId.uuidString),
            URLQueryItem(name: "token", value: session.token),
        ]

        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private struct DesiredSession: Equatable {
        let gameId: UUID
        let token: String
    }
}

extension Notification.Name {
    static let mobileRealtimeEvent = Notification.Name("mobileRealtimeEvent")
}

