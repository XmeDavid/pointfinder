import Foundation
import Network

/// Monitors network connectivity using NWPathMonitor.
/// Publishes `isOnline` state changes for the app to react to.
@MainActor
@Observable
final class NetworkMonitor {

    static let shared = NetworkMonitor()

    private(set) var isOnline = true
    private(set) var connectionType: ConnectionType = .unknown

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.prayer.pointfinder.networkmonitor", qos: .utility)

    /// Callbacks for when network status changes
    var onReconnect: (() -> Void)?

    enum ConnectionType {
        case wifi
        case cellular
        case ethernet
        case unknown
    }

    private init() {
        startMonitoring()
    }

    private func startMonitoring() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }

                let wasOnline = self.isOnline
                let newOnlineStatus = path.status == .satisfied

                self.isOnline = newOnlineStatus
                self.connectionType = self.getConnectionType(path)

                // Trigger reconnect callback if we just came back online
                if !wasOnline && newOnlineStatus {
                    self.onReconnect?()
                }
            }
        }
        monitor.start(queue: queue)
    }

    private func getConnectionType(_ path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        } else if path.usesInterfaceType(.wiredEthernet) {
            return .ethernet
        }
        return .unknown
    }

    deinit {
        monitor.cancel()
    }
}
