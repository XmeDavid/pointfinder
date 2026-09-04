import Foundation
import Security
import Tauri
import UIKit

class KeyArgs: Decodable {
  let key: String
}

class SetArgs: Decodable {
  let key: String
  let value: String
}

/// Generic-password Keychain items under one service, readable after first unlock and never
/// synced or restored to another device (so a restored backup starts logged out).
class SecureStorePlugin: Plugin {
  private let service = "com.prayer.pointfinder.securestore"

  @objc public func get(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(KeyArgs.self)
    invoke.resolve(["value": read(args.key).map { $0 as JSValue } ?? NSNull()])
  }

  @objc public func set(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(SetArgs.self)
    let status = write(args.key, args.value)
    if status == errSecSuccess {
      invoke.resolve()
    } else {
      invoke.reject("Keychain write failed (\(status))")
    }
  }

  @objc public func remove(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(KeyArgs.self)
    SecItemDelete(base(args.key) as CFDictionary)
    invoke.resolve()
  }

  @objc public func clear(_ invoke: Invoke) {
    SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service] as CFDictionary)
    invoke.resolve()
  }

  @objc public func keys(_ invoke: Invoke) {
    var query = base(nil)
    query[kSecMatchLimit] = kSecMatchLimitAll
    query[kSecReturnAttributes] = true
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    var keys: [String] = []
    if status == errSecSuccess, let items = result as? [[CFString: Any]] {
      keys = items.compactMap { $0[kSecAttrAccount] as? String }
    }
    invoke.resolve(["keys": keys])
  }

  private func base(_ key: String?) -> [CFString: Any] {
    var q: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service]
    if let key = key { q[kSecAttrAccount] = key }
    return q
  }

  private func read(_ key: String) -> String? {
    var query = base(key)
    query[kSecMatchLimit] = kSecMatchLimitOne
    query[kSecReturnData] = true
    var result: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func write(_ key: String, _ value: String) -> OSStatus {
    SecItemDelete(base(key) as CFDictionary)
    var item = base(key)
    item[kSecValueData] = value.data(using: .utf8)!
    item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(item as CFDictionary, nil)
  }
}

@_cdecl("init_plugin_pointfinder_secure_store")
func initPlugin() -> Plugin {
  return SecureStorePlugin()
}
