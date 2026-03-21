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

    private static let tagURLPrefix = "https://pointfinder.pt/tag/"

    /// Write a base ID to an NFC tag.
    func writeBaseId(_ baseId: UUID) async throws {
        #if targetEnvironment(simulator)
        throw NFCError.notAvailable
        #else
        guard NFCTagReaderSession.readingAvailable else {
            throw NFCError.notAvailable
        }

        guard let url = URL(string: "\(Self.tagURLPrefix)\(baseId.uuidString)"),
              let payload = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else {
            throw NFCError.writeFailed("Failed to construct NFC payload for base \(baseId)")
        }
        payloadToWrite = payload

        return try await withCheckedThrowingContinuation { continuation in
            // If a write is already in progress, cancel it before starting a new one.
            if let existing = self.continuation {
                existing.resume(throwing: NFCError.cancelled)
                self.continuation = nil
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
                    session.alertMessage = Translations.string("nfc.writeSuccessAlert")
                    session.invalidate()
                    DispatchQueue.main.async {
                        self?.isWriting = false
                        self?.successMessage = Translations.string("nfc.writeSuccessMessage")
                        self?.continuation?.resume()
                        self?.continuation = nil
                    }
                }
            }
        }
    }
}
