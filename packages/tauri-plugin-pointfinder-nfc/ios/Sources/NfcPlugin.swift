import CoreNFC
import Foundation
import SwiftRs
import Tauri
import UIKit
import WebKit

class ScanArgs: Decodable {
    var message: String?
    var successMessage: String?
    var timeoutMs: Int?
}

class WriteArgs: Decodable {
    let url: String
    var verify: Bool?
    var applicationRecord: Bool?
    var message: String?
    var successMessage: String?
    var timeoutMs: Int?
}

/// NDEF URL tag plugin.
///
/// iOS cannot read tags passively inside an app, so `startListening` is a
/// no-op here: the OS reads URL tags in the background and launches the app
/// through the universal link, which the deep-link plugin delivers. `scan`
/// and `write` open the system NFC sheet with a tag reader session polling
/// both ISO 14443 and ISO 15693, so every NDEF tag family is detected.
class NfcPlugin: Plugin, NFCTagReaderSessionDelegate {

    private enum Mode {
        case scan(Invoke)
        case write(Invoke, WriteArgs)
    }

    private var session: NFCTagReaderSession?
    private var mode: Mode?
    private var settled = false

    // MARK: - Commands

    @objc public func isAvailable(_ invoke: Invoke) {
        let available = NFCTagReaderSession.readingAvailable
        invoke.resolve(["available": available, "enabled": available])
    }

    @objc public func startListening(_ invoke: Invoke) { invoke.resolve() }
    @objc public func stopListening(_ invoke: Invoke) { invoke.resolve() }

    @objc public func consumePendingTag(_ invoke: Invoke) {
        // Cold start by tag on iOS arrives as a universal link, not here.
        invoke.resolve(["tag": NSNull()])
    }

    @objc public func scan(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ScanArgs.self)
        guard NFCTagReaderSession.readingAvailable else { invoke.reject("unavailable"); return }
        begin(mode: .scan(invoke), message: args.message, timeoutMs: args.timeoutMs)
    }

    @objc public func write(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(WriteArgs.self)
        guard NFCTagReaderSession.readingAvailable else { invoke.reject("unavailable"); return }
        guard URL(string: args.url) != nil else { invoke.reject("invalid"); return }
        begin(mode: .write(invoke, args), message: args.message, timeoutMs: args.timeoutMs)
    }

    @objc public func cancelScan(_ invoke: Invoke) {
        finish(error: "cancelled")
        invoke.resolve()
    }

    // MARK: - Session lifecycle

    private func begin(mode: Mode, message: String?, timeoutMs: Int?) {
        // A new request supersedes any in-flight one and tears its sheet down.
        session?.invalidate()
        finish(error: "cancelled")
        self.mode = mode
        self.settled = false
        let session = NFCTagReaderSession(pollingOption: [.iso14443, .iso15693], delegate: self, queue: .main)
        session?.alertMessage = message ?? "Hold your phone near the tag"
        self.session = session
        session?.begin()
        if let timeoutMs, timeoutMs > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs)) { [weak self] in
                guard let self, !self.settled else { return }
                self.session?.invalidate(errorMessage: "Timed out")
                self.finish(error: "timeout")
            }
        }
    }

    /// Resolve or reject the pending invoke exactly once and drop the session reference.
    private func finish(result: JSObject? = nil, error: String? = nil) {
        guard !settled, let mode else { return }
        settled = true
        self.mode = nil
        self.session = nil
        switch mode {
        case .scan(let invoke), .write(let invoke, _):
            if let result { invoke.resolve(result) } else { invoke.reject(error ?? "failed") }
        }
    }

    // MARK: - NFCTagReaderSessionDelegate

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        if let nfcError = error as? NFCReaderError,
           nfcError.code == .readerSessionInvalidationErrorUserCanceled {
            finish(error: "cancelled")
        } else {
            finish(error: "readFailed: \(error.localizedDescription)")
        }
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag found")
            return
        }
        session.connect(to: tag) { [weak self] error in
            guard let self else { return }
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }
            guard let ndefTag = Self.ndefTag(from: tag) else {
                session.invalidate(errorMessage: "Tag is not NDEF")
                return
            }
            switch self.mode {
            case .scan:
                self.read(ndefTag, session: session)
            case .write(_, let args):
                self.write(ndefTag, args: args, session: session)
            case nil:
                session.invalidate()
            }
        }
    }

    // MARK: - Read

    private func read(_ tag: NFCNDEFTag, session: NFCTagReaderSession) {
        tag.readNDEF { [weak self] message, error in
            guard let self else { return }
            if let error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }
            guard let message, !message.records.isEmpty else {
                session.invalidate(errorMessage: "Tag is empty")
                self.finish(error: "invalid")
                return
            }
            session.alertMessage = "Tag read"
            session.invalidate()
            self.finish(result: Self.payload(from: message))
        }
    }

    // MARK: - Write

    private func write(_ tag: NFCNDEFTag, args: WriteArgs, session: NFCTagReaderSession) {
        guard let url = URL(string: args.url),
              let uriRecord = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
            session.invalidate(errorMessage: "Invalid URL")
            finish(error: "invalid")
            return
        }
        var records = [uriRecord]
        if args.applicationRecord ?? true, let bundleId = Bundle.main.bundleIdentifier {
            // Android Application Record: external type "android.com:pkg".
            // Harmless on iOS, makes a tap launch the app on Android.
            records.append(NFCNDEFPayload(
                format: .nfcExternal,
                type: "android.com:pkg".data(using: .utf8)!,
                identifier: Data(),
                payload: bundleId.data(using: .utf8)!))
        }
        let message = NFCNDEFMessage(records: records)

        tag.queryNDEFStatus { [weak self] status, capacity, error in
            guard let self else { return }
            if error != nil {
                session.invalidate(errorMessage: "Could not read tag status")
                self.finish(error: "readFailed: status")
                return
            }
            guard status == .readWrite else {
                session.invalidate(errorMessage: "Tag is not writable")
                self.finish(error: "notWritable")
                return
            }
            guard message.length <= capacity else {
                session.invalidate(errorMessage: "Tag is too small")
                self.finish(error: "tooLarge")
                return
            }
            tag.writeNDEF(message) { error in
                if let error {
                    session.invalidate(errorMessage: error.localizedDescription)
                    self.finish(error: "writeFailed: \(error.localizedDescription)")
                    return
                }
                guard args.verify ?? true else {
                    session.alertMessage = args.successMessage ?? "Tag written"
                    session.invalidate()
                    self.finish(result: ["verified": false])
                    return
                }
                tag.readNDEF { readBack, _ in
                    let readUrl = readBack.flatMap(Self.firstURL(in:))
                    if let readUrl, readUrl != args.url {
                        session.invalidate(errorMessage: "Verification failed")
                        self.finish(error: "verifyMismatch")
                        return
                    }
                    session.alertMessage = args.successMessage ?? "Tag written"
                    session.invalidate()
                    self.finish(result: ["verified": readUrl != nil])
                }
            }
        }
    }

    // MARK: - Helpers

    private static func ndefTag(from tag: NFCTag) -> NFCNDEFTag? {
        switch tag {
        case .iso7816(let t): return t
        case .miFare(let t): return t
        case .iso15693(let t): return t
        case .feliCa(let t): return t
        @unknown default: return nil
        }
    }

    private static func firstURL(in message: NFCNDEFMessage) -> String? {
        for record in message.records {
            if record.typeNameFormat == .nfcWellKnown, let url = record.wellKnownTypeURIPayload() {
                return url.absoluteString
            }
        }
        return nil
    }

    private static func payload(from message: NFCNDEFMessage) -> JSObject {
        var records: [JSObject] = []
        for record in message.records {
            records.append([
                "tnf": Int(record.typeNameFormat.rawValue),
                "type": String(data: record.type, encoding: .utf8) ?? "",
                "payload": record.payload.base64EncodedString(),
            ])
        }
        let url: JSValue = firstURL(in: message).map { $0 as JSValue } ?? NSNull()
        return [
            "id": NSNull(),
            "url": url,
            "records": records,
        ]
    }
}

@_cdecl("init_plugin_pointfinder_nfc")
func initPlugin() -> Plugin {
    return NfcPlugin()
}
