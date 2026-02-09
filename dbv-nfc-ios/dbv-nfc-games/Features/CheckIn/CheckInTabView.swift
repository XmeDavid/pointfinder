import SwiftUI

struct CheckInTabView: View {
    @Environment(AppState.self) private var appState
    @State private var nfcReader = NFCReaderService()
    @State private var isScanning = false
    @State private var scanError: String?
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
            VStack(spacing: 24) {
                Spacer()

                // Check-in illustration
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.accentColor.opacity(0.1))
                            .frame(width: 160, height: 160)

                        Circle()
                            .fill(Color.accentColor.opacity(0.2))
                            .frame(width: 120, height: 120)

                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 48))
                            .foregroundStyle(.secondary)
                            .symbolEffect(.pulse, isActive: isScanning)
                    }

                    Text("Base Check-In")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Hold your phone near the marker at a base to check in")
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

                // Pending sync indicator
                if appState.pendingActionsCount > 0 {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .foregroundStyle(.orange)
                        Text("\(appState.pendingActionsCount) pending \(appState.pendingActionsCount == 1 ? "action" : "actions") to sync")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                }

                Spacer()

                // Check-in button
                Button {
                    Task { await performCheckIn() }
                } label: {
                    Label(
                        isScanning ? "Checking In..." : "Check In at Base",
                        systemImage: "location.circle.fill"
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
            .navigationTitle("Check In")
            .navigationDestination(for: UUID.self) { baseId in
                BaseCheckInDetailView(baseId: baseId, popToRoot: popToRoot)
            }
            .alert("Error", isPresented: Binding(
                get: { appState.showError },
                set: { if !$0 { appState.showError = false } }
            )) {
                Button("OK") {
                    appState.showError = false
                }
            } message: {
                Text(appState.errorMessage ?? "An unknown error occurred")
            }
        }
    }

    private func popToRoot() {
        navigationPath.removeLast(navigationPath.count)
    }

    private func performCheckIn() async {
        isScanning = true
        scanError = nil

        do {
            let baseId = try await nfcReader.scanForBaseId()

            // Regular check-in
            let result = await appState.checkIn(baseId: baseId)
            if result != nil {
                // Navigate to the base detail view
                navigationPath.append(baseId)
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

#Preview {
    CheckInTabView()
        .environment(AppState())
}
