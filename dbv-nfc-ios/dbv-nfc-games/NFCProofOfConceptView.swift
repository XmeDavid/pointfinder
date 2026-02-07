//
//  NFCProofOfConceptView.swift
//  dbv-nfc-games
//
//  Proof of concept for location-based NFC tagging
//

import SwiftUI

struct NFCProofOfConceptView: View {
    @StateObject private var nfcService = LocationNFCService()
    @State private var selectedLocation: Location?

    var body: some View {
        NavigationView {
            VStack(spacing: 30) {

                // Locations List
                VStack(alignment: .leading, spacing: 15) {
                    Text("Locations")
                        .font(.headline)

                    ForEach(LocationNFCService.sampleLocations) { location in
                        LocationRow(
                            location: location,
                            isSelected: selectedLocation?.id == location.id,
                            onSelect: { selectedLocation = location },
                            onWrite: { nfcService.writeLocation(location) }
                        )
                    }
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)

                Divider()

                // Read Section
                VStack(spacing: 15) {
                    Text("Read Location from Tag")
                        .font(.headline)

                    Button(action: {
                        nfcService.readLocation()
                    }) {
                        HStack {
                            Image(systemName: "wave.3.right")
                            Text("Scan NFC Tag")
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(10)
                    }
                    .disabled(nfcService.isScanning || nfcService.isWriting)

                    // Detected Location Display
                    if let detectedLocation = nfcService.detectedLocation {
                        VStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.largeTitle)
                                .foregroundColor(.green)

                            Text("Location Detected:")
                                .font(.subheadline)
                                .foregroundColor(.secondary)

                            Text(detectedLocation.name)
                                .font(.title2)
                                .fontWeight(.bold)

                            Text("UUID: \(detectedLocation.id.uuidString)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                        }
                        .padding()
                        .background(Color.green.opacity(0.1))
                        .cornerRadius(10)
                    }
                }

                // Status Message
                if let statusMessage = nfcService.statusMessage {
                    Text(statusMessage)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                }

                Spacer()
            }
            .padding()
            .navigationTitle("NFC Location POC")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Location Row

struct LocationRow: View {
    let location: Location
    let isSelected: Bool
    let onSelect: () -> Void
    let onWrite: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(location.name)
                    .font(.body)
                    .fontWeight(.medium)

                Text(location.id.uuidString)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }

            Spacer()

            Button(action: onWrite) {
                HStack(spacing: 4) {
                    Image(systemName: "square.and.arrow.down")
                    Text("Write")
                }
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(8)
            }
        }
        .padding()
        .background(isSelected ? Color.blue.opacity(0.1) : Color.white)
        .cornerRadius(8)
        .onTapGesture {
            onSelect()
        }
    }
}

// MARK: - Preview

#Preview {
    NFCProofOfConceptView()
}
