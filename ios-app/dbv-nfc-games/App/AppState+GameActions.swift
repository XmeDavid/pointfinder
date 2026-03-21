import Foundation
import UIKit
import os

// MARK: - Game Actions (Check-in, Submissions, Progress)

extension AppState {

    // MARK: - Progress

    /// Load game progress. If online, fetches from server and caches.
    /// If offline, loads from cache.
    func loadProgress() async {
        guard case .player(let token, _, _, let gameId) = authType else { return }
        isLoadingProgress = true

        if isOnline {
            do {
                // Fetch complete game data and cache it
                let gameData = try await apiClient.getGameData(gameId: gameId, token: token)
                await GameDataCache.shared.cacheGameData(gameData, gameId: gameId)
                baseProgress = gameData.progress
                if let status = gameData.gameStatus, var game = currentGame {
                    game = PlayerAuthResponse.GameInfo(
                        id: game.id,
                        name: game.name,
                        description: game.description,
                        status: status,
                        tileSource: game.tileSource
                    )
                    currentGame = game
                }
            } catch {
                // Fall back to cache on network error
                if let cached = await GameDataCache.shared.getCachedProgress(gameId: gameId) {
                    baseProgress = cached
                } else {
                    setError(error.localizedDescription)
                }
            }
        } else {
            // Offline: load from cache
            if let cached = await GameDataCache.shared.getCachedProgress(gameId: gameId) {
                baseProgress = cached
            }
        }

        // Update pending count
        pendingActionsCount = await OfflineQueue.shared.pendingCount

        isLoadingProgress = false
    }

    // MARK: - Check-in

    /// Check in at a base. If online, calls API directly.
    /// If offline, queues the action and returns a locally-constructed response.
    func checkIn(baseId: UUID) async -> CheckInResponse? {
        guard case .player(let token, _, let teamId, let gameId) = authType else { return nil }

        if isOnline {
            do {
                let response = try await apiClient.checkIn(gameId: gameId, baseId: baseId, token: token)

                // Cache the challenge
                if let challenge = response.challenge {
                    await GameDataCache.shared.cacheChallenge(challenge, forBaseId: baseId)
                }

                // Optimistic update so UI reflects check-in immediately
                updateLocalBaseStatus(baseId: baseId, status: .checkedIn)

                // Send location immediately so operators see the team near the base
                await locationService.sendLocationNow()

                // Refresh progress
                await loadProgress()

                return response
            } catch {
                // If network error, fall through to offline handling
                if !NetworkErrorHelper.isNetworkError(error) {
                    setError(error.localizedDescription)
                    return nil
                }
            }
        }

        // Offline path: enqueue action once and return local response
        let alreadyQueued = await OfflineQueue.shared.hasPendingCheckIn(gameId: gameId, baseId: baseId)
        if !alreadyQueued {
            await OfflineQueue.shared.enqueueCheckIn(gameId: gameId, baseId: baseId)
        }

        // Trigger sync immediately so queued actions retry as soon as possible
        Task { await SyncEngine.shared.syncPendingActions() }

        // Update local cache
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "checked_in", gameId: gameId)

        // Update local progress state
        updateLocalBaseStatus(baseId: baseId, status: .checkedIn)

        // Get cached challenge info
        let challenge = await GameDataCache.shared.getCachedChallenge(forBaseId: baseId, teamId: teamId, gameId: gameId)

        pendingActionsCount = await OfflineQueue.shared.pendingCount

        // Construct local response
        let baseName = baseProgress.first { $0.baseId == baseId }?.baseName ?? Translations.string("base.defaultName")
        return CheckInResponse(
            checkInId: UUID(), // Temporary local ID
            baseId: baseId,
            baseName: baseName,
            checkedInAt: DateFormatting.iso8601String(),
            challenge: challenge
        )
    }

    // MARK: - Text Submission

    /// Submit an answer. If online, calls API directly.
    /// If offline, queues the action and returns a locally-constructed response.
    func submitAnswer(baseId: UUID, challengeId: UUID, answer: String) async -> SubmissionResponse? {
        guard case .player(let token, _, let teamId, let gameId) = authType else { return nil }

        if isOnline {
            do {
                let request = PlayerSubmissionRequest(
                    baseId: baseId,
                    challengeId: challengeId,
                    answer: answer,
                    idempotencyKey: UUID()
                )
                let response = try await apiClient.submitAnswer(
                    gameId: gameId,
                    request: request,
                    token: token
                )

                // Optimistic update so UI reflects submission immediately
                updateLocalBaseStatus(baseId: baseId, status: .submitted)

                // Send location immediately so operators see the update
                await locationService.sendLocationNow()

                // Refresh progress
                await loadProgress()

                return response
            } catch {
                // If network error, fall through to offline handling
                if !NetworkErrorHelper.isNetworkError(error) {
                    setError(error.localizedDescription)
                    return nil
                }
            }
        }

        // Offline path: enqueue action with idempotency key
        let idempotencyKey = await OfflineQueue.shared.enqueueSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: answer
        )

        // Trigger sync immediately so queued actions retry as soon as possible
        Task { await SyncEngine.shared.syncPendingActions() }

        // Update local cache
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "submitted", gameId: gameId)

        // Update local progress state
        updateLocalBaseStatus(baseId: baseId, status: .submitted)

        pendingActionsCount = await OfflineQueue.shared.pendingCount

        // Construct local response
        return SubmissionResponse(
            id: idempotencyKey,
            teamId: teamId,
            challengeId: challengeId,
            baseId: baseId,
            answer: answer,
            fileUrl: nil,
            fileUrls: nil,
            status: "pending",
            submittedAt: DateFormatting.iso8601String(),
            reviewedBy: nil,
            feedback: nil,
            points: nil,
            completionContent: nil
        )
    }

    // MARK: - Photo Submission

    /// Submit a photo answer as an offline-capable queued media submission.
    func submitAnswerWithPhoto(baseId: UUID, challengeId: UUID, image: UIImage, notes: String) async -> SubmissionResponse? {
        guard case .player(_, _, _, _) = authType else {
            logger.error("Photo submission blocked: missing player auth context")
            return nil
        }

        // Compress to JPEG at 0.7 quality
        guard let imageData = image.jpegData(compressionQuality: 0.7) else {
            logger.error("Photo submission failed: JPEG conversion returned nil")
            setError(Translations.string("error.photoProcessing"))
            return nil
        }

        return await submitAnswerWithMedia(
            baseId: baseId,
            challengeId: challengeId,
            mediaData: imageData,
            mediaSourceURL: nil,
            contentType: "image/jpeg",
            fileName: "photo.jpg",
            notes: notes
        )
    }

    // MARK: - Multi-Media Submission

    /// Submit an answer with multiple media items (photos and/or videos).
    /// Each item is persisted locally and enqueued for chunked upload via SyncEngine.
    func submitAnswerWithMultipleMedia(
        baseId: UUID,
        challengeId: UUID,
        mediaItems: [SelectedMediaItem],
        notes: String
    ) async -> SubmissionResponse? {
        guard case .player(_, _, let teamId, let gameId) = authType else {
            logger.error("Multi-media submission blocked: missing player auth context")
            return nil
        }
        guard AppConfiguration.chunkedMediaUploadEnabled else {
            setError(Translations.string("error.mediaUploadDisabled"))
            return nil
        }
        guard !mediaItems.isEmpty else {
            setError(Translations.string("error.photoProcessing"))
            return nil
        }

        // Persist each media item locally and build PendingMediaItem array
        var pendingItems: [PendingMediaItem] = []
        for item in mediaItems {
            let sizeBytes: Int64
            do {
                let attrs = try FileManager.default.attributesOfItem(atPath: item.url.path)
                sizeBytes = attrs[.size] as? Int64 ?? 0
            } catch {
                sizeBytes = 0
            }
            guard sizeBytes > 0 else { continue }

            let fileName = item.isVideo
                ? "video.\(item.contentType == "video/quicktime" ? "mov" : "mp4")"
                : "photo.\(fileExtension(for: item.contentType))"

            do {
                // Use the URL directly (already temp-saved for videos, or will be persisted here for images)
                let localPath = try persistMediaCopy(
                    data: nil,  // Pass nil since we're using sourceURL
                    sourceURL: item.url,
                    preferredFileName: fileName,
                    contentType: item.contentType
                )
                pendingItems.append(PendingMediaItem(
                    localFilePath: localPath,
                    contentType: item.contentType,
                    sizeBytes: sizeBytes,
                    fileName: fileName
                ))
            } catch {
                logger.error("Failed to persist media item: \(error.localizedDescription, privacy: .public)")
                setError(Translations.string("error.photoProcessing"))
                return nil
            }
        }

        guard !pendingItems.isEmpty else {
            setError(Translations.string("error.photoProcessing"))
            return nil
        }

        let idempotencyKey = await OfflineQueue.shared.enqueueMultiMediaSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: notes,
            mediaItems: pendingItems
        )

        // Trigger sync immediately
        Task { await SyncEngine.shared.syncPendingActions() }

        // Update local cache/progress immediately
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "submitted", gameId: gameId)
        updateLocalBaseStatus(baseId: baseId, status: .submitted)
        pendingActionsCount = await OfflineQueue.shared.pendingCount
        if isOnline {
            await locationService.sendLocationNow()
        }

        return SubmissionResponse(
            id: idempotencyKey,
            teamId: teamId,
            challengeId: challengeId,
            baseId: baseId,
            answer: notes,
            fileUrl: nil,
            fileUrls: nil,
            status: "pending",
            submittedAt: DateFormatting.iso8601String(),
            reviewedBy: nil,
            feedback: nil,
            points: nil,
            completionContent: nil
        )
    }

    private func fileExtension(for contentType: String) -> String {
        switch contentType {
        case "image/png": return "png"
        case "image/webp": return "webp"
        case "image/heic", "image/heif": return "heic"
        case "video/mp4": return "mp4"
        case "video/quicktime": return "mov"
        default: return "jpg"
        }
    }

    // MARK: - Media Submission (single file)

    /// Queue a media submission that is later synced via resumable chunked uploads.
    func submitAnswerWithMedia(
        baseId: UUID,
        challengeId: UUID,
        mediaData: Data?,
        mediaSourceURL: URL?,
        contentType: String,
        fileName: String?,
        notes: String
    ) async -> SubmissionResponse? {
        guard case .player(_, _, let teamId, let gameId) = authType else { return nil }
        guard AppConfiguration.chunkedMediaUploadEnabled else {
            setError(Translations.string("error.mediaUploadDisabled"))
            return nil
        }

        let inferredSize = Int64(mediaData?.count ?? 0)
        let sourceSize = mediaSourceURL.map { sourceURL -> Int64 in
            let attrs = try? FileManager.default.attributesOfItem(atPath: sourceURL.path)
            return (attrs?[.size] as? NSNumber)?.int64Value ?? 0
        } ?? 0
        let sizeBytes = max(inferredSize, sourceSize)
        guard sizeBytes > 0 else {
            setError(Translations.string("error.photoProcessing"))
            return nil
        }

        let localFilePath: String?
        let sourcePath: String?
        if sizeBytes <= mediaCopyThresholdBytes {
            do {
                localFilePath = try persistMediaCopy(
                    data: mediaData,
                    sourceURL: mediaSourceURL,
                    preferredFileName: fileName,
                    contentType: contentType
                )
                sourcePath = nil
            } catch {
                logger.error("Failed to persist guaranteed media copy: \(error.localizedDescription, privacy: .public)")
                setError(Translations.string("error.photoProcessing"))
                return nil
            }
        } else {
            guard let mediaSourceURL else {
                setError(Translations.string("error.mediaSourceRequired"))
                return nil
            }
            localFilePath = nil
            sourcePath = mediaSourceURL.path
        }

        let idempotencyKey = await OfflineQueue.shared.enqueueMediaSubmission(
            gameId: gameId,
            baseId: baseId,
            challengeId: challengeId,
            answer: notes,
            contentType: contentType,
            sizeBytes: sizeBytes,
            localFilePath: localFilePath,
            sourcePath: sourcePath,
            fileName: fileName
        )

        // Trigger sync immediately so queued media retries as soon as possible.
        Task { await SyncEngine.shared.syncPendingActions() }

        // Update local cache/progress immediately.
        await GameDataCache.shared.updateBaseStatus(baseId: baseId, status: "submitted", gameId: gameId)
        updateLocalBaseStatus(baseId: baseId, status: .submitted)
        pendingActionsCount = await OfflineQueue.shared.pendingCount
        if isOnline {
            await locationService.sendLocationNow()
        }

        return SubmissionResponse(
            id: idempotencyKey,
            teamId: teamId,
            challengeId: challengeId,
            baseId: baseId,
            answer: notes,
            fileUrl: nil,
            fileUrls: nil,
            status: "pending",
            submittedAt: DateFormatting.iso8601String(),
            reviewedBy: nil,
            feedback: nil,
            points: nil,
            completionContent: nil
        )
    }

    // MARK: - Cached Challenge

    func getCachedChallenge(forBaseId baseId: UUID) async -> CheckInResponse.ChallengeInfo? {
        guard case .player(_, _, let teamId, let gameId) = authType else {
            return await GameDataCache.shared.getCachedChallenge(forBaseId: baseId)
        }
        // Try the new cache method first, fall back to legacy
        if let challenge = await GameDataCache.shared.getCachedChallenge(forBaseId: baseId, teamId: teamId, gameId: gameId) {
            return challenge
        }
        return await GameDataCache.shared.getCachedChallenge(forBaseId: baseId)
    }

    // MARK: - Deep Link

    private static let supportedTagHosts: Set<String> = ["pointfinder.pt", "pointfinder.ch"]
    private static let tagPathPrefix = "/tag/"

    func handleDeepLink(url: URL) {
        guard let host = url.host?.lowercased(),
              Self.supportedTagHosts.contains(host) else { return }
        let path = url.path
        guard path.hasPrefix(Self.tagPathPrefix) else { return }
        let rawId = String(path.dropFirst(Self.tagPathPrefix.count))
        guard let baseId = UUID(uuidString: rawId) else { return }
        pendingDeepLinkBaseId = baseId
    }

    // MARK: - Solve Session

    func startSolving(baseId: UUID, challengeId: UUID) {
        solvingBaseId = baseId
        solvingChallengeId = challengeId
    }

    func clearSolveSession() {
        solvingBaseId = nil
        solvingChallengeId = nil
    }

    // MARK: - Status Helpers

    func statusForBase(_ baseId: UUID) -> BaseStatus {
        baseProgress.first(where: { $0.baseId == baseId })?.baseStatus ?? .notVisited
    }

    func progressForBase(_ baseId: UUID) -> BaseProgress? {
        baseProgress.first(where: { $0.baseId == baseId })
    }

    private func updateLocalBaseStatus(baseId: UUID, status: BaseStatus) {
        if let index = baseProgress.firstIndex(where: { $0.baseId == baseId }) {
            baseProgress[index].status = status.rawValue
            if status == .checkedIn {
                baseProgress[index].checkedInAt = DateFormatting.iso8601String()
            }
            if status == .submitted {
                baseProgress[index].submissionStatus = "pending"
            }
        }
    }

    private func persistMediaCopy(
        data: Data?,
        sourceURL: URL?,
        preferredFileName: String?,
        contentType: String
    ) throws -> String {
        let pendingDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pending-media", isDirectory: true)
        try FileManager.default.createDirectory(at: pendingDir, withIntermediateDirectories: true)

        let fileExtension: String
        if let preferredFileName, let ext = preferredFileName.split(separator: ".").last, !ext.isEmpty {
            fileExtension = String(ext)
        } else if contentType == "image/png" {
            fileExtension = "png"
        } else if contentType == "image/webp" {
            fileExtension = "webp"
        } else if contentType == "image/heic" || contentType == "image/heif" {
            fileExtension = "heic"
        } else if contentType == "video/mp4" {
            fileExtension = "mp4"
        } else if contentType == "video/quicktime" {
            fileExtension = "mov"
        } else {
            fileExtension = "jpg"
        }

        let targetURL = pendingDir.appendingPathComponent("\(UUID().uuidString).\(fileExtension)")
        if let data {
            try data.write(to: targetURL, options: .atomic)
            return targetURL.path
        }
        if let sourceURL {
            if FileManager.default.fileExists(atPath: sourceURL.path) {
                try FileManager.default.copyItem(at: sourceURL, to: targetURL)
                return targetURL.path
            }
        }
        throw NSError(domain: "AppState", code: -1, userInfo: [NSLocalizedDescriptionKey: "No media source available"])
    }

    private var mediaCopyThresholdBytes: Int64 { 100 * 1024 * 1024 }

    // MARK: - Polling Helper

    /// Creates a Task that polls progress while the app is online and game is live.
    /// Adjusts poll interval based on realtime connection status.
    func startProgressPollingTask() -> Task<Void, Never> {
        Task {
            while !Task.isCancelled && self.isOnline && self.currentGame?.status == "live" {
                let intervalNs: UInt64 = self.realtimeConnected ? 30_000_000_000 : 10_000_000_000
                try? await Task.sleep(nanoseconds: intervalNs)
                if !Task.isCancelled {
                    await self.loadProgress()
                }
            }
        }
    }
}
