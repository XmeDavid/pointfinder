import SwiftUI
import PhotosUI

struct SolveView: View {
    @Environment(AppState.self) private var appState
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
                    Label(isPhotoType ? "Submit Your Photo" : "Submit Your Answer",
                          systemImage: isPhotoType ? "camera.fill" : "lightbulb.fill")
                        .font(.title3)
                        .fontWeight(.bold)

                    if isPhotoType {
                        Text("Take a photo or choose one from your library.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else if requirePresenceToSubmit {
                        Text("Enter your answer below. You'll need to confirm at the base to submit.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Enter your answer below and tap submit when ready.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                // Offline indicator
                if !appState.isOnline {
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .foregroundStyle(.orange)
                        Text(isPhotoType
                             ? "You're offline. Photo submissions require an internet connection."
                             : "You're offline. Submission will sync when connected.")
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
                        Text("Your Answer")
                            .font(.headline)

                        TextField("Type your answer here...", text: $answer, axis: .vertical)
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
                            requirePresenceToSubmit ? "Confirm at Base to Submit" : (isPhotoType ? "Submit Photo" : "Submit Answer"),
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
                        Text("Return to this base and tap the button to confirm your presence and submit.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if isPhotoType {
                        Text("Your photo will be reviewed by an operator.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Your answer will be reviewed and you'll earn points if correct.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Solve: \(baseName)")
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
    }

    // MARK: - Photo Input Section

    @ViewBuilder
    private var photoInputSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photo")
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
                    Label("Library", systemImage: "photo.on.rectangle")
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
                    Label("Camera", systemImage: "camera")
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
                Text("Notes (optional)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                TextField("Add a note about the photo...", text: $answer, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)
            }
        }
    }

    // MARK: - Submit Logic

    private var canSubmit: Bool {
        if isPhotoType {
            return selectedImage != nil && appState.isOnline
        } else {
            return !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private func handleSubmit() async {
        scanError = nil

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
                scanError = "Wrong base! You need to be at \(baseName) to submit."
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
        }

        isSubmitting = false
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
