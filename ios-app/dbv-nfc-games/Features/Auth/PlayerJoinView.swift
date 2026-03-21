import SwiftUI
import AVFoundation

struct PlayerJoinView: View {
    @Environment(LocaleManager.self) private var locale

    @State private var joinCode = ""
    @State private var showNameScreen = false
    @State private var cameraPermission: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @FocusState private var isCodeFocused: Bool
    @State private var scannedCode: String?  // Temporary storage for QR scan pending confirmation
    @State private var showQRConfirmation = false

    var body: some View {
        VStack(spacing: 24) {
            // QR Scanner area
            ZStack {
                if cameraPermission == .authorized {
                    QRScannerView { code in
                        scannedCode = code
                        showQRConfirmation = true
                    }
                } else if cameraPermission == .notDetermined {
                    ProgressView()
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 36))
                            .foregroundStyle(.secondary)
                        Text(locale.t("join.cameraDisabled"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 260)
            .background(Color(.systemGray6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal, 24)
            .padding(.top, 8)

            // Divider with "or"
            HStack {
                Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
                Text(locale.t("join.orEnterCode"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .layoutPriority(1)
                Rectangle().frame(height: 1).foregroundStyle(.secondary.opacity(0.3))
            }
            .padding(.horizontal, 24)

            // Manual code input
            TextField(locale.t("join.joinCode"), text: $joinCode)
                .textFieldStyle(.roundedBorder)
                .font(.title3)
                .multilineTextAlignment(.center)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .onChange(of: joinCode) { _, newValue in
                    // Enforce uppercase and alphanumeric only [A-Z0-9]
                    let filtered = newValue.filter { $0.isUppercase || $0.isNumber }
                    if filtered != newValue {
                        joinCode = filtered
                    }
                }
                .focused($isCodeFocused)
                .padding(.horizontal, 24)
                .accessibilityIdentifier("player-join-code-input")

            // Validation feedback
            if !joinCode.isEmpty {
                let trimmed = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.count < 6 {
                    Text(locale.t("join.codeTooShort"))
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 24)
                } else if isInvalidCharacters {
                    Text(locale.t("join.invalidCharacters"))
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 24)
                }
            }

            // Next button
            Button {
                isCodeFocused = false
                showNameScreen = true
            } label: {
                Text(locale.t("join.next"))
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
            }
            .background(canProceed ? Color.accentColor : Color.gray)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .disabled(!canProceed)
            .padding(.horizontal, 24)
            .accessibilityIdentifier("player-join-btn")

            Spacer()
        }
        .navigationTitle(locale.t("join.joinGame"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showNameScreen) {
            PlayerNameView(joinCode: joinCode.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        .alert(locale.t("join.qrCodeScanned"), isPresented: $showQRConfirmation) {
            Button(locale.t("common.cancel")) {
                scannedCode = nil
                showQRConfirmation = false
            }
            Button(locale.t("common.ok")) {
                if let code = scannedCode {
                    joinCode = code
                    showNameScreen = true
                }
                scannedCode = nil
            }
        } message: {
            if let code = scannedCode {
                Text(locale.t("join.qrCodeConfirm", code))
            }
        }
        .onAppear {
            if cameraPermission == .notDetermined {
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        cameraPermission = granted ? .authorized : .denied
                    }
                }
            }
        }
    }

    private var canProceed: Bool {
        let trimmed = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
        // Validate length and character set: [A-Z0-9] only
        guard trimmed.count >= 6 && trimmed.count <= 20 else { return false }
        return trimmed.allSatisfy { $0.isUppercase || $0.isNumber }
    }

    private var isInvalidCharacters: Bool {
        let trimmed = joinCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        return !trimmed.allSatisfy { $0.isUppercase || $0.isNumber }
    }
}

#Preview {
    NavigationStack {
        PlayerJoinView()
    }
    .environment(AppState())
    .environment(LocaleManager())
}
