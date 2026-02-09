import Foundation
import CoreNFC

@Observable
final class NFCWriterService: NSObject {

    var isWriting = false
    var errorMessage: String?
    var successMessage: String?

    private var session: NFCNDEFReaderSession?
    private var payloadToWrite: NFCNDEFPayload?
    private var continuation: CheckedContinuation<Void, Error>?

    /// Write a base ID to an NFC tag.
    func writeBaseId(_ baseId: UUID) async throws {
        #if targetEnvironment(simulator)
        throw NFCError.notAvailable
        #else
        guard NFCNDEFReaderSession.readingAvailable else {
            throw NFCError.notAvailable
        }

        let json: [String: Any] = ["baseId": baseId.uuidString]
        let data = try JSONSerialization.data(withJSONObject: json)

        payloadToWrite = NFCNDEFPayload(
            format: .media,
            type: "application/json".data(using: .utf8)!,
            identifier: Data(),
            payload: data
        )

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            self.errorMessage = nil
            self.successMessage = nil
            self.isWriting = true

            self.session = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: false)
            self.session?.alertMessage = Translations.string("nfc.holdToWrite")
            self.session?.begin()
        }
        #endif
    }
}

// MARK: - NFCNDEFReaderSessionDelegate

extension NFCWriterService: NFCNDEFReaderSessionDelegate {

    func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession) {}

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
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

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        // Not used for writing
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [any NFCNDEFTag]) {
        guard let tag = tags.first, let payload = payloadToWrite else {
            session.invalidate(errorMessage: Translations.string("nfc.noTagFound"))
            return
        }

        session.connect(to: tag) { [weak self] error in
            if let error = error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }

            tag.queryNDEFStatus { status, _, error in
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
}
