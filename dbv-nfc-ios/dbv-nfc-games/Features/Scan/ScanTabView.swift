import SwiftUI

struct ScanTabView: View {
    @Environment(AppState.self) private var appState
    @State private var nfcReader = NFCReaderService()
    @State private var isScanning = false
    @State private var scanError: String?
    @State private var checkedInBaseId: UUID?
    @State private var navigateToBase = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // NFC illustration
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.accentColor.opacity(0.1))
                            .frame(width: 160, height: 160)

                        Circle()
                            .fill(Color.accentColor.opacity(0.2))
                            .frame(width: 120, height: 120)

                        Image(systemName: "sensor.tag.radiowaves.forward")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                            .symbolEffect(.pulse, isActive: isScanning)
                    }

                    Text("Scan NFC Tag")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Hold your phone near the NFC tag at a base to check in")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }

                if let error = scanError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                // Active solve session indicator
                if let solvingBaseId = appState.solvingBaseId {
                    let baseName = appState.progressForBase(solvingBaseId)?.baseName ?? "Unknown Base"
                    VStack(spacing: 8) {
                        Divider()
                        HStack {
                            Image(systemName: "lightbulb.fill")
                                .foregroundStyle(.orange)
                            Text("Solving: \(baseName)")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Spacer()
                            Button("Cancel") {
                                appState.clearSolveSession()
                            }
                            .font(.caption)
                        }
                        .padding(.horizontal)
                        Text("Scan the tag at this base to submit your answer")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Scan button
                Button {
                    Task { await performScan() }
                } label: {
                    Label(
                        isScanning ? "Scanning..." : "Start Scan",
                        systemImage: "wave.3.right"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isScanning ? Color.gray : Color.accentColor)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(isScanning)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .navigationTitle("Scan")
            .navigationDestination(isPresented: $navigateToBase) {
                if let baseId = checkedInBaseId {
                    ScanBaseDetailView(baseId: baseId)
                }
            }
        }
    }

    private func performScan() async {
        isScanning = true
        scanError = nil

        do {
            let baseId = try await nfcReader.scanForBaseId()

            // Check if we're in a solve session
            if let solvingBaseId = appState.solvingBaseId,
               let _ = appState.solvingChallengeId {
                if baseId == solvingBaseId {
                    NotificationCenter.default.post(
                        name: .nfcScanConfirmed,
                        object: nil,
                        userInfo: ["baseId": baseId]
                    )
                } else {
                    scanError = "Wrong base! You need to scan the tag at \(appState.progressForBase(solvingBaseId)?.baseName ?? "the correct base")"
                }
            } else {
                // Regular check-in scan
                let result = await appState.checkIn(baseId: baseId)
                if result != nil {
                    // Navigate to the base detail view
                    checkedInBaseId = baseId
                    navigateToBase = true
                }
            }
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled, no error to show
            } else {
                scanError = error.localizedDescription
            }
        } catch {
            scanError = error.localizedDescription
        }

        isScanning = false
    }
}

extension Notification.Name {
    static let nfcScanConfirmed = Notification.Name("nfcScanConfirmed")
}

#Preview {
    ScanTabView()
        .environment(AppState())
}
