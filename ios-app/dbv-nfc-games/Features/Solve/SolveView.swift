import SwiftUI
import PhotosUI
import AVFoundation

// MARK: - Selected Media Item

struct SelectedMediaItem: Identifiable {
    let id = UUID()
    let thumbnail: UIImage
    let isVideo: Bool
    let url: URL  // Store URL for chunked reading instead of full data
    let contentType: String
}

struct SolveView: View {
    @Environment(AppState.self) private var appState
    @Environment(LocaleManager.self) private var locale
    @Environment(\.dismiss) private var dismiss

    let baseId: UUID
    let challengeId: UUID
    let baseName: String
    let requirePresenceToSubmit: Bool
    let answerType: String
    let challengeTitle: String
    let challengeDescription: String
    let challengeContent: String
    /// Optional closure to dismiss all the way back to the map (dismisses the sheet)
    var dismissToMap: (() -> Void)?

    @State private var answer = ""
    @State private var isSubmitting = false
    @State private var showResult = false
    @State private var submissionResult: SubmissionResponse?
    @State private var nfcReader = NFCReaderService()
    @State private var scanError: String?
    @State private var submissionErrorMessage: String?

    // Media state (multi-selection)
    @State private var selectedItems: [PhotosPickerItem] = []
    @State private var selectedMedia: [SelectedMediaItem] = []
    @State private var showCamera = false
    @State private var cameraImage: UIImage?

    private var isPhotoType: Bool {
        answerType == "file"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Challenge content
                VStack(alignment: .leading, spacing: 8) {
                    Text(challengeTitle)
                        .font(.title3)
                        .fontWeight(.bold)

                    if !challengeDescription.isEmpty {
                        Text(challengeDescription)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if !challengeContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        AutoSizingHTMLView(html: challengeContent)
                    }
                }

                Divider()

                // Game not live warning - only show if we KNOW the game is not live
                // (not when currentGame is nil / not yet loaded from API)
                if let status = appState.currentGame?.status, status != "live" {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                                .font(.headline)
                            Text(locale.t("solve.gameNotLive"))
                                .font(.subheadline)
                                .fontWeight(.semibold)
                        }
                        Text(locale.t("solve.gameNotLiveExplanation"))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

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
                            .accessibilityIdentifier("player-answer-input")
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
                .accessibilityIdentifier("player-submit-btn")

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
            CameraView(image: $cameraImage)
                .ignoresSafeArea()
        }
        .onChange(of: selectedItems) { _, newItems in
            Task {
                await loadSelectedItems(newItems)
            }
        }
        .onChange(of: cameraImage) { _, newImage in
            if let image = newImage {
                addCameraImageToMedia(image)
                cameraImage = nil
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

            // Thumbnail grid
            if !selectedMedia.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(selectedMedia) { item in
                            ZStack(alignment: .topTrailing) {
                                SwiftUI.Image(uiImage: item.thumbnail)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 100, height: 100)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))

                                // Video indicator
                                if item.isVideo {
                                    SwiftUI.Image(systemName: "play.circle.fill")
                                        .font(.title3)
                                        .foregroundStyle(.white)
                                        .shadow(radius: 2)
                                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                                }

                                // Remove button
                                Button {
                                    removeMediaItem(item.id)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.title3)
                                        .symbolRenderingMode(.palette)
                                        .foregroundStyle(.white, .black.opacity(0.6))
                                }
                                .padding(4)
                            }
                            .frame(width: 100, height: 100)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Text(locale.t("solve.mediaSelected", "\(selectedMedia.count)"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Picker buttons
            let libraryLabel = locale.t("solve.library")
            HStack(spacing: 12) {
                PhotosPicker(selection: $selectedItems, maxSelectionCount: 5, matching: .any(of: [.images, .videos])) {
                    Label(libraryLabel, systemImage: "photo.on.rectangle")
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
                .disabled(selectedMedia.count >= 5)
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

    // MARK: - Media Processing

    private func loadSelectedItems(_ items: [PhotosPickerItem]) async {
        var newMedia: [SelectedMediaItem] = []

        for item in items {
            // Try loading as video first
            if let movieTransferable = try? await item.loadTransferable(type: VideoTransferable.self) {
                let videoURL = movieTransferable.url
                if let thumbnail = generateVideoThumbnail(url: videoURL) {
                    let contentType = videoURL.pathExtension.lowercased() == "mov" ? "video/quicktime" : "video/mp4"
                    newMedia.append(SelectedMediaItem(
                        thumbnail: thumbnail,
                        isVideo: true,
                        url: videoURL,  // Store URL for chunked reading, not full data
                        contentType: contentType
                    ))
                }
            } else if let data = try? await item.loadTransferable(type: Data.self),
                      let uiImage = UIImage(data: data) {
                // Image
                let contentType: String
                if let typeId = item.supportedContentTypes.first?.identifier {
                    if typeId.contains("png") {
                        contentType = "image/png"
                    } else if typeId.contains("heic") || typeId.contains("heif") {
                        contentType = "image/heic"
                    } else if typeId.contains("webp") {
                        contentType = "image/webp"
                    } else {
                        contentType = "image/jpeg"
                    }
                } else {
                    contentType = "image/jpeg"
                }
                // For images, save to temp file to get a URL
                if let tempURL = saveTempFile(data: data) {
                    newMedia.append(SelectedMediaItem(
                        thumbnail: uiImage,
                        isVideo: false,
                        url: tempURL,  // Store URL for consistent handling
                        contentType: contentType
                    ))
                }
            }
        }

        await MainActor.run {
            selectedMedia = newMedia
        }
    }

    /// Save image data to a temporary file to get a URL for consistent upload handling.
    private func saveTempFile(data: Data) -> URL? {
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = UUID().uuidString + ".tmp"
        let tempURL = tempDir.appendingPathComponent(fileName)
        try? data.write(to: tempURL)
        return FileManager.default.fileExists(atPath: tempURL.path) ? tempURL : nil
    }

    private func generateVideoThumbnail(url: URL) -> UIImage? {
        let asset = AVAsset(url: url)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        do {
            let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
            return UIImage(cgImage: cgImage)
        } catch {
            return nil
        }
    }

    private func addCameraImageToMedia(_ image: UIImage) {
        guard selectedMedia.count < 5 else { return }
        guard let imageData = image.jpegData(compressionQuality: 0.7) else { return }
        // Save image to temp file to get a URL for consistent upload handling
        guard let tempURL = saveTempFile(data: imageData) else { return }
        let item = SelectedMediaItem(
            thumbnail: image,
            isVideo: false,
            url: tempURL,
            contentType: "image/jpeg"
        )
        selectedMedia.append(item)
    }

    private func removeMediaItem(_ id: UUID) {
        selectedMedia.removeAll { $0.id == id }
        // Clear the PhotosPicker selection since we manage state via selectedMedia
        selectedItems.removeAll()
    }

    // MARK: - Submit Logic

    private var canSubmit: Bool {
        // Allow submit when game status is "live" OR unknown (nil = not yet loaded)
        if let status = appState.currentGame?.status, status != "live" { return false }
        if isPhotoType {
            return !selectedMedia.isEmpty
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
            let scannedPayload = try await nfcReader.scanForBaseId()

            // Verify the scanned base matches
            guard scannedPayload.baseId == baseId else {
                scanError = locale.t("solve.wrongBase", baseName)
                isSubmitting = false
                return
            }

            // NFC confirmed, now submit
            let result: SubmissionResponse?
            if isPhotoType, !selectedMedia.isEmpty {
                result = await appState.submitAnswerWithMultipleMedia(
                    baseId: baseId,
                    challengeId: challengeId,
                    mediaItems: selectedMedia,
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
        if isPhotoType, !selectedMedia.isEmpty {
            result = await appState.submitAnswerWithMultipleMedia(
                baseId: baseId,
                challengeId: challengeId,
                mediaItems: selectedMedia,
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

// MARK: - Video Transferable

struct VideoTransferable: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.url)
        } importing: { received in
            let tempDir = FileManager.default.temporaryDirectory
            let targetURL = tempDir.appendingPathComponent(UUID().uuidString + "." + received.file.pathExtension)
            try FileManager.default.copyItem(at: received.file, to: targetURL)
            return Self(url: targetURL)
        }
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
