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

    /// Write a base ID to an NFC tag.
    func writeBaseId(_ baseId: UUID) async throws {
        #if targetEnvironment(simulator)
        throw NFCError.notAvailable
        #else
        guard NFCTagReaderSession.readingAvailable else {
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

            // Check if the tag supports NDEF
            guard case let .iso7816(ndefTag) = tag,
                  let ndefTag = ndefTag as? NFCNDEFTag else {
                // Try other tag types
                self?.handleNonISO7816Tag(tag, payload: payload, session: session)
                return
            }

            self?.writeNDEFToTag(ndefTag, payload: payload, session: session)
        }
    }

    private func handleNonISO7816Tag(_ tag: NFCTag, payload: NFCNDEFPayload, session: NFCTagReaderSession) {
        // Try to get NDEF interface from other tag types
        let ndefTag: NFCNDEFTag?

        switch tag {
        case .miFare(let mifareTag):
            ndefTag = mifareTag
        case .iso15693(let iso15693Tag):
            ndefTag = iso15693Tag
        case .feliCa(let felicaTag):
            ndefTag = felicaTag
        case .iso7816:
            ndefTag = nil
        @unknown default:
            ndefTag = nil
        }

        guard let ndefTag = ndefTag else {
            session.invalidate(errorMessage: Translations.string("nfc.noTagFound"))
            return
        }

        writeNDEFToTag(ndefTag, payload: payload, session: session)
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
