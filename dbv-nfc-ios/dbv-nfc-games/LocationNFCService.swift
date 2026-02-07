//
//  LocationNFCService.swift
//  dbv-nfc-games
//
//  Simple NFC service for location proof of concept
//

import Foundation

#if canImport(CoreNFC)
import CoreNFC

// MARK: - Location Model

struct Location: Identifiable, Equatable {
    let id: UUID
    let name: String

    init(name: String) {
        self.id = UUID()
        self.name = name
    }

    init(id: UUID, name: String) {
        self.id = id
        self.name = name
    }
}

// MARK: - NFC Location Service

@MainActor
final class LocationNFCService: NSObject, ObservableObject {
    @Published var isScanning: Bool = false
    @Published var isWriting: Bool = false
    @Published var statusMessage: String?
    @Published var detectedLocation: Location?

    private var ndefSession: NFCNDEFReaderSession?
    private var locationToWrite: Location?

    // Sample locations
    static let sampleLocations: [Location] = [
        Location(name: "Conference Room A"),
        Location(name: "Main Entrance"),
        Location(name: "Parking Garage")
    ]

    // MARK: - Write UUID to NFC Tag

    func writeLocation(_ location: Location) {
        guard NFCNDEFReaderSession.readingAvailable else {
            statusMessage = "NFC not available on this device"
            return
        }

        locationToWrite = location
        isWriting = true
        statusMessage = "Ready to write '\(location.name)'"

        let session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: false)
        session.alertMessage = "Hold near NFC tag to write location"
        session.begin()
        self.ndefSession = session
    }

    // MARK: - Read Location from NFC Tag

    func readLocation() {
        guard NFCNDEFReaderSession.readingAvailable else {
            statusMessage = "NFC not available on this device"
            return
        }

        locationToWrite = nil
        isScanning = true
        statusMessage = "Ready to scan"
        detectedLocation = nil

        let session = NFCNDEFReaderSession(delegate: self, queue: nil, invalidateAfterFirstRead: true)
        session.alertMessage = "Hold near NFC tag to read location"
        session.begin()
        self.ndefSession = session
    }

    func stopSession() {
        ndefSession?.invalidate()
        ndefSession = nil
        isScanning = false
        isWriting = false
    }
}

// MARK: - NDEF Reader Session Delegate

extension LocationNFCService: NFCNDEFReaderSessionDelegate {

    func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        Task { @MainActor in
            let nfcError = error as? NFCReaderError
            if nfcError?.code != .readerSessionInvalidationErrorUserCanceled {
                self.statusMessage = "Error: \(error.localizedDescription)"
            }
            self.isScanning = false
            self.isWriting = false
            self.ndefSession = nil
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        // This is called when tags are detected during read
        guard let message = messages.first,
              let record = message.records.first else {
            return
        }

        Task { @MainActor in
            // Try to extract the UUID from the payload
            if let uuidString = String(data: record.payload, encoding: .utf8),
               let uuid = UUID(uuidString: uuidString) {
                // Find matching location
                if let location = LocationNFCService.sampleLocations.first(where: { $0.id == uuid }) {
                    self.detectedLocation = location
                    self.statusMessage = "Location found: \(location.name)"
                    session.alertMessage = "Location: \(location.name)"
                } else {
                    self.statusMessage = "Unknown location UUID: \(uuid)"
                    session.alertMessage = "Unknown location"
                }
            } else {
                self.statusMessage = "Invalid data on tag"
                session.alertMessage = "Invalid data"
            }

            self.isScanning = false
        }
    }

    func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        // This is called when we need to write or query the tag
        guard let tag = tags.first else { return }

        session.connect(to: tag) { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                session.invalidate(errorMessage: "Connection failed: \(error.localizedDescription)")
                return
            }

            // Check if we're writing or reading
            if let locationToWrite = self.locationToWrite {
                self.writeLocationToTag(tag: tag, location: locationToWrite, session: session)
            } else {
                self.readLocationFromTag(tag: tag, session: session)
            }
        }
    }

    private func writeLocationToTag(tag: NFCNDEFTag, location: Location, session: NFCNDEFReaderSession) {
        // Query the tag to check if it's writable
        tag.queryNDEFStatus { status, capacity, error in
            if let error = error {
                session.invalidate(errorMessage: "Query failed: \(error.localizedDescription)")
                return
            }

            guard status == .readWrite else {
                session.invalidate(errorMessage: "Tag is not writable")
                return
            }

            // Create NDEF message with location UUID
            let uuidString = location.id.uuidString
            let payload = NFCNDEFPayload(
                format: .nfcWellKnown,
                type: "T".data(using: .utf8)!,
                identifier: Data(),
                payload: uuidString.data(using: .utf8)!
            )
            let message = NFCNDEFMessage(records: [payload])

            // Write to tag
            tag.writeNDEF(message) { error in
                if let error = error {
                    session.invalidate(errorMessage: "Write failed: \(error.localizedDescription)")
                } else {
                    Task { @MainActor in
                        self.statusMessage = "Successfully wrote '\(location.name)' to tag"
                        self.isWriting = false
                    }
                    session.alertMessage = "Write successful!"
                    session.invalidate()
                }
            }
        }
    }

    private func readLocationFromTag(tag: NFCNDEFTag, session: NFCNDEFReaderSession) {
        tag.readNDEF { message, error in
            if let error = error {
                session.invalidate(errorMessage: "Read failed: \(error.localizedDescription)")
                return
            }

            guard let message = message,
                  let record = message.records.first else {
                session.invalidate(errorMessage: "No data on tag")
                return
            }

            Task { @MainActor in
                // Try to extract the UUID from the payload
                if let uuidString = String(data: record.payload, encoding: .utf8),
                   let uuid = UUID(uuidString: uuidString) {
                    // Find matching location
                    if let location = LocationNFCService.sampleLocations.first(where: { $0.id == uuid }) {
                        self.detectedLocation = location
                        self.statusMessage = "Location found: \(location.name)"
                        session.alertMessage = "Location: \(location.name)"
                    } else {
                        self.statusMessage = "Unknown location UUID: \(uuid)"
                        session.alertMessage = "Unknown location"
                    }
                } else {
                    self.statusMessage = "Invalid data on tag"
                    session.alertMessage = "Invalid data"
                }

                self.isScanning = false
            }

            session.invalidate()
        }
    }
}

#else
// Stub for non-NFC platforms
@MainActor
final class LocationNFCService: NSObject, ObservableObject {
    @Published var isScanning: Bool = false
    @Published var isWriting: Bool = false
    @Published var statusMessage: String?
    @Published var detectedLocation: Location?

    static let sampleLocations: [Location] = [
        Location(name: "Conference Room A"),
        Location(name: "Main Entrance"),
        Location(name: "Parking Garage")
    ]

    func writeLocation(_ location: Location) {
        statusMessage = "NFC not available on this platform"
    }

    func readLocation() {
        statusMessage = "NFC not available on this platform"
    }

    func stopSession() {}
}

struct Location: Identifiable, Equatable {
    let id: UUID
    let name: String

    init(name: String) {
        self.id = UUID()
        self.name = name
    }

    init(id: UUID, name: String) {
        self.id = id
        self.name = name
    }
}
#endif
