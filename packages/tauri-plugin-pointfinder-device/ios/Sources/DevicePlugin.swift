import Foundation
import Tauri
import UIKit
import WebKit

private struct ShareArgs: Decodable { let path: String; let contentType: String }

class DevicePlugin: Plugin {
    private var observers: [NSObjectProtocol] = []
    private weak var hostView: WKWebView?

    @objc public override func load(webview: WKWebView) {
        hostView = webview
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.trigger("foreground", data: ["active": true])
        })
        observers.append(center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.trigger("foreground", data: ["active": false])
        })
    }

    deinit { for observer in observers { NotificationCenter.default.removeObserver(observer) } }

    @objc public func shareFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ShareArgs.self)
        DispatchQueue.main.async { [weak self] in
            guard let view = self?.hostView, let root = view.window?.rootViewController else {
                invoke.reject("unavailable: No active window")
                return
            }
            let url = URL(fileURLWithPath: args.path).standardizedFileURL
            let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].path + "/"
            guard url.path.hasPrefix(cache), FileManager.default.fileExists(atPath: url.path) else {
                invoke.reject("invalid: File is outside app exports")
                return
            }
            var presenter = root
            while let presented = presenter.presentedViewController { presenter = presented }
            if presenter is UIActivityViewController {
                invoke.reject("busy: Sharing is already open")
                return
            }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            sheet.completionWithItemsHandler = { _, completed, _, error in
                if let error { invoke.reject("failed: \(error.localizedDescription)") }
                else { invoke.resolve(["result": completed ? "shared" : "cancelled"]) }
            }
            presenter.present(sheet, animated: true)
        }
    }
}

@_cdecl("init_plugin_pointfinder_device")
func initPlugin() -> Plugin { DevicePlugin() }
