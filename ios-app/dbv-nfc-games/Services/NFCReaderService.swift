import Foundation
import CoreNFC

@Observable
final class NFCReaderService: NSObject {

    var lastReadBaseId: UUID?
    var isReading = false
    var errorMessage: String?

    private var session: NFCTagReaderSession?
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
        guard NFCTagReaderSession.readingAvailable else {
            throw NFCError.notAvailable
        }

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            self.errorMessage = nil
            self.isReading = true

            self.session = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main)
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

// MARK: - NFCTagReaderSessionDelegate

extension NFCReaderService: NFCTagReaderSessionDelegate {

    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}

    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
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

    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard let tag = tags.first else {
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
                self?.handleNonISO7816Tag(tag, session: session)
                return
            }

            self?.readNDEFFromTag(ndefTag, session: session)
        }
    }

    private func handleNonISO7816Tag(_ tag: NFCTag, session: NFCTagReaderSession) {
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

        readNDEFFromTag(ndefTag, session: session)
    }

    private func readNDEFFromTag(_ tag: NFCNDEFTag, session: NFCTagReaderSession) {
        tag.readNDEF { [weak self] message, error in
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

    private static let supportedTagHosts: Set<String> = [
        "pointfinder.pt",
        "pointfinder.ch",
    ]
    private static let tagPathPrefix = "/tag/"

    private func processRecord(_ record: NFCNDEFPayload, session: NFCTagReaderSession) {
        // Try URL record first (new format: https://pointfinder.pt/tag/{baseId})
        if let baseId = extractBaseIdFromURI(record) {
            succeedWith(baseId: baseId, session: session)
            return
        }

        // Try to parse as JSON with baseId (legacy MIME format)
        let payload = record.payload
        if let json = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
           let baseIdString = json["baseId"] as? String,
           let baseId = UUID(uuidString: baseIdString) {
            succeedWith(baseId: baseId, session: session)
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
                succeedWith(baseId: baseId, session: session)
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

    /// Extract baseId from a well-known URI record (https://pointfinder.{pt|ch}/tag/{uuid}).
    private func extractBaseIdFromURI(_ record: NFCNDEFPayload) -> UUID? {
        guard record.typeNameFormat == .nfcWellKnown else { return nil }
        guard let url = record.wellKnownTypeURIPayload() else { return nil }
        guard let host = url.host?.lowercased(), Self.supportedTagHosts.contains(host) else { return nil }
        let path = url.path
        guard path.hasPrefix(Self.tagPathPrefix) else { return nil }
        let idString = String(path.dropFirst(Self.tagPathPrefix.count))
        return UUID(uuidString: idString)
    }

    private func succeedWith(baseId: UUID, session: NFCTagReaderSession) {
        session.alertMessage = Translations.string("nfc.readSuccess")
        session.invalidate()
        DispatchQueue.main.async { [weak self] in
            self?.lastReadBaseId = baseId
            self?.isReading = false
            self?.session = nil
            self?.resolveContinuation(.success(baseId))
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
