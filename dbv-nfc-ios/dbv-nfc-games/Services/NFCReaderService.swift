import Foundation
import CoreNFC

@Observable
final class NFCReaderService: NSObject {

    var lastReadBaseId: UUID?
    var isReading = false
    var errorMessage: String?

    private var session: NFCNDEFReaderSession?
    private var continuation: CheckedContinuation<UUID, Error>?

    /// Start an NFC read session and return the base ID found on the tag.
    func scanForBaseId() async throws -> UUID {
        #if targetEnvironment(simulator)
        throw NFCError.notAvailable
        #else
        guard NFCNDEFReaderSession.readingAvailable else {
            throw NFCError.notAvailable
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            self.errorMessage = nil
            self.isReading = true

            self.session = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: true)
            self.session?.alertMessage = "Hold your iPhone near the NFC tag"
            self.session?.begin()
        }
        #endif
    }

    func stopReading() {
        session?.invalidate()
        session = nil
        isReading = false
    }
}

// MARK: - NFCNDEFReaderSessionDelegate

extension NFCReaderService: NFCNDEFReaderSessionDelegate {

    func readerSessionDidBecomeActive(_ session: NFCNDEFReaderSession) {}

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.isReading = false
            if let nfcError = error as? NFCReaderError,
               nfcError.code == .readerSessionInvalidationErrorUserCanceled {
                self?.continuation?.resume(throwing: NFCError.cancelled)
            } else if self?.continuation != nil {
                self?.errorMessage = error.localizedDescription
                self?.continuation?.resume(throwing: NFCError.readFailed(error.localizedDescription))
            }
            self?.continuation = nil
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        guard let message = messages.first,
              let record = message.records.first else {
            continuation?.resume(throwing: NFCError.noData)
            continuation = nil
            isReading = false
            return
        }

        processRecord(record, session: session)
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [any NFCNDEFTag]) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: "No tag found")
            return
        }

        session.connect(to: tag) { [weak self] error in
            if let error = error {
                session.invalidate(errorMessage: error.localizedDescription)
                return
            }

            tag.readNDEF { message, error in
                if let error = error {
                    session.invalidate(errorMessage: error.localizedDescription)
                    return
                }

                guard let message = message, let record = message.records.first else {
                    session.invalidate(errorMessage: "No data on tag")
                    return
                }

                self?.processRecord(record, session: session)
            }
        }
    }

    private func processRecord(_ record: NFCNDEFPayload, session: NFCNDEFReaderSession) {
        let payload = record.payload

        // Try to parse as JSON with baseId
        if let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
           let baseIdString = json["baseId"] as? String,
           let baseId = UUID(uuidString: baseIdString) {
            session.alertMessage = "Tag read successfully!"
            session.invalidate()
            DispatchQueue.main.async { [weak self] in
                self?.lastReadBaseId = baseId
                self?.isReading = false
                self?.continuation?.resume(returning: baseId)
                self?.continuation = nil
            }
            return
        }

        // Try parsing the text record (NDEF text record has a prefix byte for language code)
        if record.typeNameFormat == .nfcWellKnown {
            let text: String
            if let str = record.wellKnownTypeTextPayload().0 {
                text = str
            } else {
                // Try raw payload skipping first byte (status byte)
                let trimmed = payload.dropFirst()
                text = String(data: trimmed, encoding: .utf8) ?? ""
            }

            if let data = text.data(using: .utf8),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let baseIdString = json["baseId"] as? String,
               let baseId = UUID(uuidString: baseIdString) {
                session.alertMessage = "Tag read successfully!"
                session.invalidate()
                DispatchQueue.main.async { [weak self] in
                    self?.lastReadBaseId = baseId
                    self?.isReading = false
                    self?.continuation?.resume(returning: baseId)
                    self?.continuation = nil
                }
                return
            }
        }

        session.invalidate(errorMessage: "Invalid tag data")
        DispatchQueue.main.async { [weak self] in
            self?.isReading = false
            self?.continuation?.resume(throwing: NFCError.invalidData)
            self?.continuation = nil
        }
    }
}

// MARK: - Errors

enum NFCError: LocalizedError {
    case notAvailable
    case cancelled
    case readFailed(String)
    case noData
    case invalidData
    case writeFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAvailable: return "NFC is not available on this device"
        case .cancelled: return "NFC scan was cancelled"
        case .readFailed(let msg): return "NFC read failed: \(msg)"
        case .noData: return "No data found on tag"
        case .invalidData: return "Tag does not contain valid base data"
        case .writeFailed(let msg): return "NFC write failed: \(msg)"
        }
    }
}
