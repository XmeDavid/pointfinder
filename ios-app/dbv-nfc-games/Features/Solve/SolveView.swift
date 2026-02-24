import SwiftUI
import PhotosUI

struct SolveView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID
    let challengeId: UUID
    let baseName: String
    let requirePresenceToSubmit: Bool
    let answerType: String
    /// Optional closure to dismiss all the way back to the map (dismisses the sheet)
    var dismissToMap: (() -> Void)?

    @State private var answer = ""
    @State private var isSubmitting = false
    @State private var showResult = false
    @State private var submissionResult: SubmissionResponse?
    @State private var nfcReader = NFCReaderService()
    @State private var scanError: String?
    @State private var submissionErrorMessage: String?

    // Photo state
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var showCamera = false

    private var isPhotoType: Bool {
        answerType == "file"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Instructions
                VStack(alignment: .leading, spacing: 8) {
                    Label(isPhotoType ? locale.t("solve.submitPhoto") : locale.t("solve.submitAnswer"),
                          systemImage: isPhotoType ? "camera.fill" : "lightbulb.fill")
                        .font(.title3)
                        .fontWeight(.bold)

                    if isPhotoType {
                        Text(locale.t("solve.photoInstructions"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else if requirePresenceToSubmit {
                        Text(locale.t("solve.presenceInstructions"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(locale.t("solve.answerInstructions"))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Offline indicator
                if !appState.isOnline {
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .foregroundStyle(.orange)
                        Text(locale.t("offline.submissionSync"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if isPhotoType {
                    // Photo input
                    photoInputSection
                } else {
                    // Text answer input
                    VStack(alignment: .leading, spacing: 8) {
                        Text(locale.t("solve.yourAnswer"))
                            .font(.headline)

                        TextField(locale.t("solve.typeAnswer"), text: $answer, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .lineLimit(3...8)
                    }
                }

                if let error = scanError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .padding(.horizontal)
                }

                // Submit button
                Button {
                    Task { await handleSubmit() }
                } label: {
                    if isSubmitting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.gray)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                    } else {
                        Label(
                            requirePresenceToSubmit
                                ? locale.t("solve.confirmAtBase")
                                : (isPhotoType ? locale.t("solve.submitPhotoBtn") : locale.t("solve.submitAnswerBtn")),
                            systemImage: requirePresenceToSubmit ? "location.circle.fill" : "paperplane.fill"
                        )
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(canSubmit ? Color.accentColor : Color.gray)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .disabled(!canSubmit || isSubmitting)

                // Help text
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.blue)
                    if requirePresenceToSubmit {
                        Text(locale.t("solve.presenceHelp"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if isPhotoType {
                        Text(locale.t("solve.photoHelp"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(locale.t("solve.answerHelp"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
        .navigationTitle(locale.t("solve.navTitle", baseName))
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(isPresented: $showResult) {
            if let result = submissionResult {
                SubmissionResultView(submission: result, baseName: baseName, dismissToMap: dismissToMap)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraView(image: $selectedImage)
                .ignoresSafeArea()
        }
        .onChange(of: selectedPhoto) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    selectedImage = uiImage
                }
            }
        }
        .alert(locale.t("common.error"), isPresented: Binding(
            get: { submissionErrorMessage != nil },
            set: { if !$0 { submissionErrorMessage = nil } }
        )) {
            Button(locale.t("common.ok")) {
                submissionErrorMessage = nil
            }
        } message: {
            Text(submissionErrorMessage ?? locale.t("common.unknownError"))
        }
    }

    // MARK: - Photo Input Section

    @ViewBuilder
    private var photoInputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(locale.t("solve.photo"))
                .font(.headline)

            if let image = selectedImage {
                // Preview
                ZStack(alignment: .topTrailing) {
                    SwiftUI.Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 250)
                        .clipShape(RoundedRectangle(cornerRadius: 12))

                    Button {
                        selectedImage = nil
                        selectedPhoto = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title2)
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .black.opacity(0.6))
                    }
                    .padding(8)
                }
            }

            // Picker buttons
            HStack(spacing: 12) {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(locale.t("solve.library"), systemImage: "photo.on.rectangle")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                Button {
                    showCamera = true
                } label: {
                    Label(locale.t("solve.camera"), systemImage: "camera")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }

            // Notes (optional)
            VStack(alignment: .leading, spacing: 4) {
                Text(locale.t("solve.notesOptional"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField(locale.t("solve.addNote"), text: $answer, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)
            }
        }
    }

    // MARK: - Submit Logic

    private var canSubmit: Bool {
        if isPhotoType {
            return selectedImage != nil
        } else {
            return !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private func handleSubmit() async {
        scanError = nil
        submissionErrorMessage = nil

        if requirePresenceToSubmit {
            await submitWithPresenceCheck()
        } else {
            await submitDirectly()
        }
    }

    private func submitWithPresenceCheck() async {
        isSubmitting = true

        do {
            // Scan NFC to verify presence
            let scannedBaseId = try await nfcReader.scanForBaseId()

            // Verify the scanned base matches
            guard scannedBaseId == baseId else {
                scanError = locale.t("solve.wrongBase", baseName)
                isSubmitting = false
                return
            }

            // NFC confirmed, now submit
            let result: SubmissionResponse?
            if isPhotoType, let image = selectedImage {
                result = await appState.submitAnswerWithPhoto(
                    baseId: baseId,
                    challengeId: challengeId,
                    image: image,
                    notes: answer.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            } else {
                result = await appState.submitAnswer(
                    baseId: baseId,
                    challengeId: challengeId,
                    answer: answer.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            }

            if let result {
                submissionResult = result
                showResult = true
            } else {
                showSubmissionError()
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

        isSubmitting = false
    }

    private func submitDirectly() async {
        isSubmitting = true

        let result: SubmissionResponse?
        if isPhotoType, let image = selectedImage {
            result = await appState.submitAnswerWithPhoto(
                baseId: baseId,
                challengeId: challengeId,
                image: image,
                notes: answer.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        } else {
            result = await appState.submitAnswer(
                baseId: baseId,
                challengeId: challengeId,
                answer: answer.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }

        if let result {
            submissionResult = result
            showResult = true
        } else {
            showSubmissionError()
        }

        isSubmitting = false
    }

    private func showSubmissionError() {
        if appState.showError, let message = appState.errorMessage {
            submissionErrorMessage = message
        } else {
            submissionErrorMessage = locale.t("common.unknownError")
        }
        // Prevent delayed parent-level alerts from appearing after this local error.
        appState.showError = false
    }
}

// MARK: - Camera View (UIImagePickerController wrapper)

struct CameraView: UIViewControllerRepresentable {
    @Binding var image: UIImage?
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraView

        init(_ parent: CameraView) {
            self.parent = parent
        }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let uiImage = info[.originalImage] as? UIImage {
                parent.image = uiImage
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
