import SwiftUI

struct SubmitScanView: View {
    @Environment(AppState.self) private var appState
    @State private var nfcReader = NFCReaderService()

    let baseId: UUID
    let challengeId: UUID
    let baseName: String
    let answer: String

    @State private var isScanning = false
    @State private var isSubmitting = false
    @State private var submissionResult: SubmissionResponse?
    @State private var showResult = false
    @State private var scanError: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            if isSubmitting {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Submitting your answer...")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            } else {
                // NFC scan prompt
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.orange.opacity(0.1))
                            .frame(width: 140, height: 140)

                        Image(systemName: "sensor.tag.radiowaves.forward")
                            .font(.system(size: 48))
                            .foregroundStyle(.orange)
                            .symbolEffect(.pulse, isActive: isScanning)
                    }

                    Text("Scan Tag to Confirm")
                        .font(.title3)
                        .fontWeight(.bold)

                    Text("Hold your phone near the NFC tag at \(baseName) to submit your answer")
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
            }

            Spacer()

            if !isSubmitting {
                Button {
                    Task { await performScanAndSubmit() }
                } label: {
                    Label(
                        isScanning ? "Scanning..." : "Scan NFC Tag",
                        systemImage: "wave.3.right"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(isScanning ? Color.gray : Color.orange)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(isScanning)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
        }
        .navigationTitle("Confirm Submission")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) {
            if let result = submissionResult {
                SubmissionResultView(submission: result, baseName: baseName)
            }
        }
    }

    private func performScanAndSubmit() async {
        isScanning = true
        scanError = nil

        do {
            let scannedBaseId = try await nfcReader.scanForBaseId()

            // Verify it's the correct base
            guard scannedBaseId == baseId else {
                scanError = "Wrong base! You need to scan the tag at \(baseName)"
                isScanning = false
                return
            }

            isScanning = false
            isSubmitting = true

            // Submit the answer
            if let result = await appState.submitAnswer(
                baseId: baseId,
                challengeId: challengeId,
                answer: answer
            ) {
                submissionResult = result
                appState.clearSolveSession()
                showResult = true
            }

            isSubmitting = false
        } catch let error as NFCError {
            if case .cancelled = error {
                // User cancelled
            } else {
                scanError = error.localizedDescription
            }
            isScanning = false
        } catch {
            scanError = error.localizedDescription
            isScanning = false
        }
    }
}
