import Foundation
import ObjectiveC
import SwiftRs
import Tauri
import UIKit
import UserNotifications
import WebKit

/// Push notifications through APNs.
///
/// The app delegate belongs to Tauri, so the two registration callbacks are
/// attached to its class at runtime with the Objective-C runtime. No
/// swizzling of existing methods: the methods are added only when the
/// delegate does not implement them, which is the case for Tauri's delegate.
/// Foreground presentation and taps go through the notification centre
/// delegate, which the plugin owns outright.
class PushPlugin: Plugin, UNUserNotificationCenterDelegate {

    private static weak var current: PushPlugin?

    private var pendingRegister: Invoke?
    private var lastToken: String?
    private var launchTap: JSObject?

    @objc public override func load(webview: WKWebView) {
        PushPlugin.current = self
        UNUserNotificationCenter.current().delegate = self
        installDelegateHooks()
    }

    // MARK: - Commands

    @objc public func permissionStatus(_ invoke: Invoke) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            invoke.resolve(["status": Self.status(settings.authorizationStatus)])
        }
    }

    @objc public func requestPermission(_ invoke: Invoke) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                invoke.reject("permissionFailed: \(error.localizedDescription)")
                return
            }
            invoke.resolve(["status": granted ? "granted" : "denied"])
        }
    }

    @objc public func register(_ invoke: Invoke) {
        if let token = lastToken {
            invoke.resolve(["token": token, "platform": "ios"])
            return
        }
        pendingRegister?.reject("cancelled")
        pendingRegister = invoke
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    @objc public func consumeLaunchTap(_ invoke: Invoke) {
        let tap: JSValue = launchTap.map { $0 as JSValue } ?? NSNull()
        launchTap = nil
        invoke.resolve(["tap": tap])
    }

    // MARK: - APNs callbacks (reached through the runtime hooks below)

    fileprivate func didRegister(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        lastToken = token
        pendingRegister?.resolve(["token": token, "platform": "ios"])
        pendingRegister = nil
        trigger("token", data: ["token": token, "platform": "ios"])
    }

    fileprivate func didFailToRegister(error: Error) {
        pendingRegister?.reject("registrationFailed: \(error.localizedDescription)")
        pendingRegister = nil
    }

    // MARK: - UNUserNotificationCenterDelegate

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        trigger("notification", data: Self.payload(from: notification.request.content))
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let tap = Self.payload(from: response.notification.request.content)
        launchTap = tap
        trigger("notificationTap", data: tap)
        completionHandler()
    }

    // MARK: - Helpers

    private static func status(_ s: UNAuthorizationStatus) -> String {
        switch s {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    private static func payload(from content: UNNotificationContent) -> JSObject {
        var data: JSObject = [:]
        for (k, v) in content.userInfo {
            guard let key = k as? String, key != "aps" else { continue }
            data[key] = "\(v)"
        }
        return [
            "title": content.title,
            "body": content.body,
            "data": data,
        ]
    }

    /// Adds the two APNs registration callbacks to the app delegate's class.
    private func installDelegateHooks() {
        guard let delegate = UIApplication.shared.delegate else { return }
        let cls: AnyClass = type(of: delegate)

        let successSel = #selector(UIApplicationDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:))
        if !delegate.responds(to: successSel) {
            let block: @convention(block) (AnyObject, UIApplication, Data) -> Void = { _, _, token in
                PushPlugin.current?.didRegister(deviceToken: token)
            }
            class_addMethod(cls, successSel, imp_implementationWithBlock(block), "v@:@@")
        }

        let failureSel = #selector(UIApplicationDelegate.application(_:didFailToRegisterForRemoteNotificationsWithError:))
        if !delegate.responds(to: failureSel) {
            let block: @convention(block) (AnyObject, UIApplication, Error) -> Void = { _, _, error in
                PushPlugin.current?.didFailToRegister(error: error)
            }
            class_addMethod(cls, failureSel, imp_implementationWithBlock(block), "v@:@@")
        }
    }
}

@_cdecl("init_plugin_pointfinder_push")
func initPlugin() -> Plugin {
    return PushPlugin()
}
