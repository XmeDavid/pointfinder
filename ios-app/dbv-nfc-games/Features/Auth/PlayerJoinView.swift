import SwiftUI
import AVFoundation

struct PlayerJoinView: View {
    @Environment(LocaleManager.self) private var locale

    @State private var joinCode = ""
    @State private var showNameScreen = false
    @State private var cameraPermission: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)

    var body: some View {
        VStack(spacing: 24) {
            // QR Scanner area
            ZStack {
                if cameraPermission == .authorized {
                    QRScannerView { code in
                        joinCode = code
                        showNameScreen = true
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
                .padding(.horizontal, 24)

            // Next button
            Button {
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

            Spacer()
        }
        .navigationTitle(locale.t("join.joinGame"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showNameScreen) {
            PlayerNameView(joinCode: joinCode.trimmingCharacters(in: .whitespacesAndNewlines))
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
        !joinCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

#Preview {
    NavigationStack {
        PlayerJoinView()
    }
    .environment(AppState())
    .environment(LocaleManager())
}
