import Foundation
import CoreNFC

@Observable
final class NFCReaderService: NSObject {

    var lastReadBaseId: UUID?
    var isReading = false
    var errorMessage: String?

    private var session: NFCNDEFReaderSession?
    private var continuation: CheckedContinuation<UUID, Error>?

    private func resolveContinuation(_ result: Result<UUID, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        switch result {
        case .success(let baseId):
            continuation.resume(returning: baseId)
        case .failure(let error):
            continuation.resume(throwing: error)
        }
    }

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
            self.session?.alertMessage = Translations.string("nfc.holdToRead")
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
            guard let self else { return }
            self.isReading = false
            self.session = nil
            if let nfcError = error as? NFCReaderError,
               nfcError.code == .readerSessionInvalidationErrorUserCanceled {
                self.resolveContinuation(.failure(NFCError.cancelled))
            } else if self.continuation != nil {
                self.errorMessage = error.localizedDescription
                self.resolveContinuation(.failure(NFCError.readFailed(error.localizedDescription)))
            }
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        guard let message = messages.first,
              let record = message.records.first else {
            DispatchQueue.main.async { [weak self] in
                self?.isReading = false
                self?.resolveContinuation(.failure(NFCError.noData))
            }
            return
        }

        processRecord(record, session: session)
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [any NFCNDEFTag]) {
        guard let tag = tags.first else {
            session.invalidate(errorMessage: Translations.string("nfc.noTagFound"))
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
                    session.invalidate(errorMessage: Translations.string("nfc.noDataOnTag"))
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
            session.alertMessage = Translations.string("nfc.readSuccess")
            session.invalidate()
            DispatchQueue.main.async { [weak self] in
                self?.lastReadBaseId = baseId
                self?.isReading = false
                self?.session = nil
                self?.resolveContinuation(.success(baseId))
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
                session.alertMessage = Translations.string("nfc.readSuccess")
                session.invalidate()
                DispatchQueue.main.async { [weak self] in
                    self?.lastReadBaseId = baseId
                    self?.isReading = false
                    self?.session = nil
                    self?.resolveContinuation(.success(baseId))
                }
                return
            }
        }

        session.invalidate(errorMessage: Translations.string("nfc.invalidTagData"))
        DispatchQueue.main.async { [weak self] in
            self?.isReading = false
            self?.session = nil
            self?.resolveContinuation(.failure(NFCError.invalidData))
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
        case .notAvailable: return Translations.string("nfcError.notAvailable")
        case .cancelled: return Translations.string("nfcError.cancelled")
        case .readFailed(let msg): return String(format: Translations.string("nfcError.readFailed"), msg)
        case .noData: return Translations.string("nfcError.noData")
        case .invalidData: return Translations.string("nfcError.invalidData")
        case .writeFailed(let msg): return String(format: Translations.string("nfcError.writeFailed"), msg)
        }
    }
}
