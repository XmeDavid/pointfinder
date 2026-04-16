import Foundation
import CoreNFC

@Observable
final class NFCWriterService: NSObject {

    var isWriting = false
    var errorMessage: String?
    var successMessage: String?

    private var session: NFCTagReaderSession?
    private var payloadToWrite: NFCNDEFPayload?
    private var continuation: CheckedContinuation<Void, Error>?

    /// Base ID of the tag currently being written. Retained for post-write
    /// round-trip verification (iOS parity with Android): after `writeNDEF`
    /// succeeds we re-read the tag and confirm the parsed baseId+token
    /// match what we intended to write.
    private var pendingBaseId: UUID?
    private var pendingToken: String?

    private static let tagURLPrefix = "https://pointfinder.pt/tag/"

    /// Write a base ID (and optional token) to an NFC tag.
    ///
    /// Backend expects lowercase UUIDs in NFC payloads (so iOS tags
    /// byte-match Android tags, which write lowercase by default via
    /// `NfcPayloadCodec.normalizeBaseId`). `UUID.uuidString` returns the
    /// uppercase form on iOS; we lowercase before serialisation.
    func writeBaseId(_ baseId: UUID, nfcToken: String? = nil) async throws {
        #if targetEnvironment(simulator)
        throw NFCError.notAvailable
        #else
        guard NFCTagReaderSession.readingAvailable else {
            throw NFCError.notAvailable
        }

        let lowercasedId = baseId.uuidString.lowercased()
        let urlString: String
        if let token = nfcToken {
            urlString = "\(Self.tagURLPrefix)\(lowercasedId)?t=\(token)"
        } else {
            urlString = "\(Self.tagURLPrefix)\(lowercasedId)"
        }
        guard let url = URL(string: urlString),
              let payload = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
            throw NFCError.writeFailed("Failed to construct NFC payload for base \(baseId)")
        }
        payloadToWrite = payload
        pendingBaseId = baseId
        pendingToken = nfcToken

        return try await withCheckedThrowingContinuation { continuation in
            // If a write is already in progress, cancel its continuation
            // AND tear down the previous session. The old code only
            // resumed the continuation, leaking the CoreNFC session and
            // leaving the user stuck with a stale system sheet.
            if let existing = self.continuation {
                existing.resume(throwing: NFCError.cancelled)
                self.continuation = nil
                self.session?.invalidate()
                self.session = nil
            }
            self.continuation = continuation
            self.errorMessage = nil
            self.successMessage = nil
            self.isWriting = true

            self.session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main)
            self.session?.alertMessage = Translations.string("nfc.holdToWrite")
            self.session?.begin()
        }
        #endif
    }
}

// MARK: - NFCTagReaderSessionDelegate

extension NFCWriterService: NFCTagReaderSessionDelegate {

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.isWriting = false
            if let nfcError = error as? NFCReaderError,
               nfcError.code == .readerSessionInvalidationErrorUserCanceled {
                self?.continuation?.resume(throwing: NFCError.cancelled)
            } else if self?.continuation != nil {
                self?.continuation?.resume(throwing: NFCError.writeFailed(error.localizedDescription))
            }
            self?.continuation = nil
        }
    }

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let tag = tags.first, let payload = payloadToWrite else {
            session.invalidate(errorMessage: Translations.string("nfc.noTagFound"))
            return
        }

        session.connect(to: tag) { [weak self] error in
            if let error = error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }

            guard let ndefTag = NFCTagHelper.ndefTag(from: tag) else {
                session.invalidate(errorMessage: Translations.string("nfc.noTagFound"))
                return
            }

            self?.writeNDEFToTag(ndefTag, payload: payload, session: session)
        }
    }

    private func writeNDEFToTag(_ tag: NFCNDEFTag, payload: NFCNDEFPayload, session: NFCTagReaderSession) {
        tag.queryNDEFStatus { [weak self] status, _, error in
            guard error == nil else {
                session.invalidate(errorMessage: Translations.string("nfc.failedQueryStatus"))
                return
            }

            guard status == .readWrite else {
                session.invalidate(errorMessage: Translations.string("nfc.tagNotWritable"))
                return
            }

            let message = NFCNDEFMessage(records: [payload])
            tag.writeNDEF(message) { error in
                if let error = error {
                    session.invalidate(errorMessage: error.localizedDescription)
                } else {
                    // Post-write verification (audit Wave D item 5 / iOS
                    // parity with Android). Re-read the tag and confirm
                    // the parsed baseId (and optional token) match what
                    // we just wrote. Budget: must not delay more than
                    // ~200ms; if the re-read fails we accept the
                    // uncertainty (log only) rather than false-negative.
                    self?.verifyWrittenTag(tag, session: session)
                }
            }
        }
    }

    /// Round-trip verify after `writeNDEF` succeeds. Re-reads the tag,
    /// parses the payload via [NfcPayloadDecoder], and checks baseId +
    /// token match [pendingBaseId] / [pendingToken]. On mismatch the
    /// session is invalidated with `nfcError.writeVerifyFailed` and the
    /// continuation is resumed with an error. If the re-read itself
    /// fails (tag removed too quickly), we treat the write as a
    /// best-effort success rather than penalise the operator.
    private func verifyWrittenTag(_ tag: NFCNDEFTag, session: NFCTagReaderSession) {
        let expectedBaseId = pendingBaseId
        let expectedToken = pendingToken
        tag.readNDEF { [weak self] message, _ in
            guard let self else { return }
            let matched = Self.verify(
                message: message,
                expectedBaseId: expectedBaseId,
                expectedToken: expectedToken
            )
            if matched == .mismatch {
                let failureMessage = Translations.string("nfcError.writeVerifyFailed")
                session.invalidate(errorMessage: failureMessage)
                DispatchQueue.main.async {
                    self.isWriting = false
                    self.errorMessage = failureMessage
                    self.continuation?.resume(throwing: NFCError.writeFailed(failureMessage))
                    self.continuation = nil
                    self.pendingBaseId = nil
                    self.pendingToken = nil
                }
                return
            }
            // Either verification passed or the re-read was inconclusive —
            // treat as success to stay within the 200ms UX budget.
            session.alertMessage = Translations.string("nfc.writeSuccessAlert")
            session.invalidate()
            DispatchQueue.main.async {
                self.isWriting = false
                self.successMessage = Translations.string("nfc.writeSuccessMessage")
                self.continuation?.resume()
                self.continuation = nil
                self.pendingBaseId = nil
                self.pendingToken = nil
            }
        }
    }

    private enum VerifyOutcome { case matched, inconclusive, mismatch }

    /// Inspect the read-back NDEF message. Returns `.mismatch` only when
    /// a payload was successfully parsed and it does NOT match expected
    /// values — anything else (missing message, unparseable record) is
    /// treated as `.inconclusive` to avoid false negatives.
    private static func verify(
        message: NFCNDEFMessage?,
        expectedBaseId: UUID?,
        expectedToken: String?
    ) -> VerifyOutcome {
        guard let expectedBaseId,
              let message,
              let record = message.records.first else {
            return .inconclusive
        }
        // Only URI records carry the canonical tag URL format.
        guard let url = record.wellKnownTypeURIPayload() else {
            return .inconclusive
        }
        let absolute = url.absoluteString
        let supportedPrefixes = [
            "https://pointfinder.pt/tag/",
            "https://pointfinder.ch/tag/",
        ]
        guard let prefix = supportedPrefixes.first(where: { absolute.hasPrefix($0) }) else {
            return .inconclusive
        }
        let remainder = String(absolute.dropFirst(prefix.count))
        let components = URLComponents(string: "https://x/\(remainder)")
        let path = components?.path.replacingOccurrences(of: "/", with: "") ?? remainder.split(separator: "?").first.map(String.init) ?? remainder
        let readToken = components?.queryItems?.first(where: { $0.name == "t" })?.value
        guard let readBaseId = UUID(uuidString: path) else {
            return .inconclusive
        }
        if readBaseId != expectedBaseId {
            return .mismatch
        }
        if let expectedToken, readToken != expectedToken {
            return .mismatch
        }
        return .matched
    }
}
