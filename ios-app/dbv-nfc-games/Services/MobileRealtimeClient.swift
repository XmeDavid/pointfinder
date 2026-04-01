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
    /// Called when connection is re-established after a disconnection
    var onReconnect: (() async -> Void)?
    /// Returns a fresh token on reconnect. If nil, falls back to the token passed to connect().
    var tokenProvider: (() -> String?)?

    private let urlSession = URLSession(configuration: .default)
    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var reconnectTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?
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
        pingTask?.cancel()
        pingTask = nil
        receiveTask?.cancel()
        receiveTask = nil
        socketTask?.cancel(with: .normalClosure, reason: nil)
        socketTask = nil
        connectionState = .disconnected
    }

    /// Call when the app returns to foreground to ensure connection is alive.
    func ensureConnected() {
        guard desiredSession != nil else { return }
        if connectionState == .connected, let task = socketTask {
            // Verify with a ping; if it fails, reconnect
            task.sendPing { [weak self] error in
                Task { @MainActor [weak self] in
                    if error != nil {
                        self?.logger.info("Foreground ping failed, reconnecting")
                        self?.handleDisconnect()
                    }
                }
            }
        } else if connectionState == .disconnected {
            reconnectAttempt = 0
            openConnection()
        }
    }

    private func openConnection() {
        guard let desiredSession else {
            connectionState = .disconnected
            return
        }

        connectionState = reconnectAttempt == 0 ? .connecting : .reconnecting(attempt: reconnectAttempt)

        pingTask?.cancel()
        receiveTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)

        // On reconnection, fetch a fresh token so expired operator tokens don't
        // silently prevent reconnection. Falls back to the stored token if no
        // tokenProvider is configured (e.g. players with long-lived tokens).
        let effectiveToken = tokenProvider?() ?? desiredSession.token
        guard let request = buildRequest(session: desiredSession, token: effectiveToken) else {
            connectionState = .disconnected
            return
        }

        let task = urlSession.webSocketTask(with: request)
        socketTask = task
        task.resume()
        startReceiveLoop(task: task)
        startPingLoop(task: task)
    }

    private func startReceiveLoop(task: URLSessionWebSocketTask) {
        receiveTask = Task { [weak self] in
            // First successful receive confirms connection
            var firstMessage = true
            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    if firstMessage {
                        firstMessage = false
                        let wasReconnecting = self?.reconnectAttempt ?? 0 > 0
                        self?.connectionState = .connected
                        self?.reconnectAttempt = 0
                        // Trigger data refresh if this was a reconnection
                        if wasReconnecting {
                            await self?.onReconnect?()
                        }
                    }
                    self?.handleMessage(message)
                } catch {
                    self?.handleDisconnect()
                    break
                }
            }
        }
    }

    private func startPingLoop(task: URLSessionWebSocketTask) {
        pingTask = Task { [weak self] in
            // Don't mark as connected until a message is actually received
            // The receiveLoop will set .connected when the first message arrives

            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15_000_000_000) // 15 seconds
                guard !Task.isCancelled else { break }
                guard let self, let socket = self.socketTask, socket === task else { break }

                await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                    socket.sendPing { [weak self] error in
                        if let error {
                            Task { @MainActor [weak self] in
                                self?.logger.debug("Ping failed: \(error.localizedDescription, privacy: .public)")
                                self?.handleDisconnect()
                            }
                        }
                        continuation.resume()
                    }
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
        pingTask?.cancel()
        pingTask = nil
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

    private func buildRequest(session: DesiredSession, token: String) -> URLRequest? {
        guard let base = URL(string: AppConfiguration.apiBaseURL),
              var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            return nil
        }

        components.scheme = base.scheme == "https" ? "wss" : "ws"
        components.path = "/ws/mobile"
        components.queryItems = [
            URLQueryItem(name: "gameId", value: session.gameId.uuidString.lowercased()),
        ]

        guard let url = components.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 30
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
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
