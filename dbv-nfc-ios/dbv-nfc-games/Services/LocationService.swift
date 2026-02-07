import Foundation
import CoreLocation

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

        locationManager.requestWhenInUseAuthorization()
        locationManager.startUpdatingLocation()

        // Send location on a fixed timer
        sendTimer?.invalidate()
        sendTimer = Timer.scheduledTimer(withTimeInterval: sendInterval, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.sendCurrentLocation()
            }
        }
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

    // MARK: - Sending

    private func sendCurrentLocation() async {
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
            print("[LocationService] Failed to send location: \(error.localizedDescription)")
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension LocationService: CLLocationManagerDelegate {

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            self.lastLocation = location
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("[LocationService] Location error: \(error.localizedDescription)")
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        case .denied, .restricted:
            print("[LocationService] Location access denied")
        default:
            break
        }
    }
}
