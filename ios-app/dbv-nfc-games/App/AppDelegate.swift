import UIKit
import os
import UserNotifications
import MapLibre

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        configureOfflineMapCache()
        return true
    }

    // MARK: - Offline Map Tile Caching

    /// Raises the MapLibre ambient tile cache from the default 50 MB to 100 MB so
    /// previously-viewed tiles survive longer when players are at outdoor events
    /// with poor connectivity (audit finding 8.12).
    private func configureOfflineMapCache() {
        let cacheSize: UInt = 100 * 1024 * 1024 // 100 MB
        MLNOfflineStorage.shared.setMaximumAmbientCacheSize(cacheSize) { error in
            if let error {
                Logger(subsystem: "com.prayer.pointfinder", category: "MapCache")
                    .error("Failed to set ambient cache size: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: - Remote Notification Registration

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Task {
            await PushNotificationService.shared.didReceiveToken(token)
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Logger(subsystem: "com.prayer.pointfinder", category: "AppDelegate").error("Push registration failed: \(error.localizedDescription, privacy: .public)")
    }

    // MARK: - Foreground Notification Handling

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        return [.banner, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse) async {
        // Handle notification tap - can be extended later for deep linking
        let userInfo = response.notification.request.content.userInfo
        Logger(subsystem: "com.prayer.pointfinder", category: "AppDelegate").debug("Notification tapped")
    }
}
