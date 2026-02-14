import Foundation
import CoreLocation
import os

/// Tracks user location and periodically sends updates to the server.
/// Uses `whenInUse` authorization — no background mode required since the
/// app is open during active gameplay.
@MainActor
final class LocationService: NSObject, ObservableObject {

    private let locationManager = CLLocationManager()
    private var apiClient: APIClient?
    private var gameId: UUID?
    private var token: String?
    private var sendTimer: Timer?
    private var lastLocation: CLLocation?

    /// How often to send location updates to the server (seconds).
    private let sendInterval: TimeInterval = 30

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.distanceFilter = 10 // meters
    }

    // MARK: - Public API

    /// Start tracking and sending location updates.
    func startTracking(apiClient: APIClient, gameId: UUID, token: String) {
        self.apiClient = apiClient
        self.gameId = gameId
        self.token = token
        // Reset lastLocation so we send on first update
        self.lastLocation = nil

        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()

        scheduleSendTimer()
    }

    /// Stop tracking and sending location.
    func stopTracking() {
        locationManager.stopUpdatingLocation()
        sendTimer?.invalidate()
        sendTimer = nil
        apiClient = nil
        gameId = nil
        token = nil
        lastLocation = nil
    }

    /// Send the current location immediately (e.g. after a check-in or submission).
    /// Also resets the timer so the next periodic send is a full interval later.
    func sendLocationNow() async {
        guard NetworkMonitor.shared.isOnline else { return }
        await sendCurrentLocation()

        // Reset the timer so we don't double-send shortly after
        scheduleSendTimer()
    }

    // MARK: - Sending

    private func sendCurrentLocation() async {
        guard NetworkMonitor.shared.isOnline else { return }
        guard let location = lastLocation,
              let apiClient, let gameId, let token else { return }

        do {
            try await apiClient.updateLocation(
                gameId: gameId,
                lat: location.coordinate.latitude,
                lng: location.coordinate.longitude,
                token: token
            )
        } catch {
            // Silently ignore location update failures — not critical
            Logger(subsystem: "com.prayer.pointfinder", category: "LocationService").debug(" Failed to send location: \(error.localizedDescription)")
        }
    }

    private func scheduleSendTimer() {
        sendTimer?.invalidate()
        guard apiClient != nil, gameId != nil, token != nil else {
            sendTimer = nil
            return
        }

        sendTimer = Timer.scheduledTimer(withTimeInterval: sendInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.sendCurrentLocation()
            }
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            // If this is the first location we're receiving, send it immediately
            let isFirstLocation = self.lastLocation == nil
            self.lastLocation = location
            if isFirstLocation {
                await self.sendLocationNow()
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Logger(subsystem: "com.prayer.pointfinder", category: "LocationService").debug(" Location error: \(error.localizedDescription)")
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        case .denied, .restricted:
            Logger(subsystem: "com.prayer.pointfinder", category: "LocationService").debug(" Location access denied")
        default:
            break
        }
    }
}
