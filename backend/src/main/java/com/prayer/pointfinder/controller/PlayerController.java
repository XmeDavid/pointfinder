package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.request.PlayerSubmissionRequest;
import com.prayer.pointfinder.dto.request.UpdateLocationRequest;
import com.prayer.pointfinder.dto.request.UpdatePushTokenRequest;
import com.prayer.pointfinder.dto.request.UploadSessionInitRequest;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.GameNotification;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.repository.GameNotificationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ChunkedUploadService;
import com.prayer.pointfinder.service.FileStorageService;
import com.prayer.pointfinder.service.PlayerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequiredArgsConstructor
public class PlayerController {

    private final PlayerService playerService;
    private final ChunkedUploadService chunkedUploadService;
    private final FileStorageService fileStorageService;
    private final GameNotificationRepository gameNotificationRepository;
    private final PlayerRepository playerRepository;

    // Public endpoint - no auth required
    @PostMapping("/api/auth/player/join")
    public ResponseEntity<PlayerAuthResponse> joinTeam(@Valid @RequestBody PlayerJoinRequest request) {
        return ResponseEntity.ok(playerService.joinTeam(request));
    }

    // Player-authenticated endpoints below

    @PostMapping("/api/player/games/{gameId}/bases/{baseId}/check-in")
    public ResponseEntity<CheckInResponse> checkIn(@PathVariable UUID gameId,
                                                    @PathVariable UUID baseId) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(playerService.checkIn(gameId, baseId, player));
    }

    @GetMapping("/api/player/games/{gameId}/progress")
    public ResponseEntity<List<BaseProgressResponse>> getProgress(@PathVariable UUID gameId) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(playerService.getProgress(gameId, player));
    }

    @GetMapping("/api/player/games/{gameId}/bases")
    public ResponseEntity<List<BaseResponse>> getBases(@PathVariable UUID gameId) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(playerService.getBases(gameId, player));
    }

    @GetMapping("/api/player/games/{gameId}/data")
    public ResponseEntity<GameDataResponse> getGameData(@PathVariable UUID gameId) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(playerService.getGameData(gameId, player));
    }

    @PostMapping("/api/player/games/{gameId}/submissions")
    public ResponseEntity<SubmissionResponse> submitAnswer(@PathVariable UUID gameId,
                                                            @Valid @RequestBody PlayerSubmissionRequest request) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(playerService.submitAnswer(gameId, request, player));
    }

    @PostMapping(value = "/api/player/games/{gameId}/submissions/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<SubmissionResponse> submitAnswerWithFile(
            @PathVariable UUID gameId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("baseId") UUID baseId,
            @RequestParam("challengeId") UUID challengeId,
            @RequestParam(value = "answer", required = false, defaultValue = "") String answer,
            @RequestParam(value = "idempotencyKey", required = false) UUID idempotencyKey) {
        Player player = SecurityUtils.getCurrentPlayer();

        // Store the file and get the URL
        String fileUrl = fileStorageService.store(file, gameId);

        // Build the submission request with the file URL
        PlayerSubmissionRequest request = new PlayerSubmissionRequest();
        request.setBaseId(baseId);
        request.setChallengeId(challengeId);
        request.setAnswer(answer);
        request.setFileUrl(fileUrl);
        request.setIdempotencyKey(idempotencyKey);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(playerService.submitAnswer(gameId, request, player));
    }

    @PostMapping("/api/player/games/{gameId}/uploads/sessions")
    public ResponseEntity<UploadSessionResponse> createUploadSession(
            @PathVariable UUID gameId,
            @Valid @RequestBody UploadSessionInitRequest request
    ) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(chunkedUploadService.createSession(gameId, player, request));
    }

    @PutMapping(value = "/api/player/games/{gameId}/uploads/sessions/{sessionId}/chunks/{chunkIndex}",
            consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<UploadSessionResponse> uploadSessionChunk(
            @PathVariable UUID gameId,
            @PathVariable UUID sessionId,
            @PathVariable int chunkIndex,
            @RequestBody byte[] chunkPayload
    ) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(
                chunkedUploadService.uploadChunk(gameId, sessionId, chunkIndex, chunkPayload, player)
        );
    }

    @GetMapping("/api/player/games/{gameId}/uploads/sessions/{sessionId}")
    public ResponseEntity<UploadSessionResponse> getUploadSession(
            @PathVariable UUID gameId,
            @PathVariable UUID sessionId
    ) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(chunkedUploadService.getSession(gameId, sessionId, player));
    }

    @PostMapping("/api/player/games/{gameId}/uploads/sessions/{sessionId}/complete")
    public ResponseEntity<UploadSessionResponse> completeUploadSession(
            @PathVariable UUID gameId,
            @PathVariable UUID sessionId
    ) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(chunkedUploadService.completeSession(gameId, sessionId, player));
    }

    @DeleteMapping("/api/player/games/{gameId}/uploads/sessions/{sessionId}")
    public ResponseEntity<Void> cancelUploadSession(
            @PathVariable UUID gameId,
            @PathVariable UUID sessionId
    ) {
        Player player = SecurityUtils.getCurrentPlayer();
        chunkedUploadService.cancelSession(gameId, sessionId, player);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/player/games/{gameId}/location")
    public ResponseEntity<Void> updateLocation(@PathVariable UUID gameId,
                                                @Valid @RequestBody UpdateLocationRequest request) {
        Player player = SecurityUtils.getCurrentPlayer();
        playerService.updateLocation(gameId, player, request.getLat(), request.getLng());
        return ResponseEntity.ok().build();
    }

    @PutMapping("/api/player/push-token")
    public ResponseEntity<Void> updatePushToken(@Valid @RequestBody UpdatePushTokenRequest request) {
        Player player = SecurityUtils.getCurrentPlayer();
        playerService.updatePushToken(player, request.getPushToken(), request.resolvePlatform());
        return ResponseEntity.ok().build();
    }

    /**
     * Self-service player data deletion endpoint.
     * Deletes the player record, their push token, and any associated data.
     * Team-level data (submissions, check-ins) is preserved as it belongs to the team.
     */
    @DeleteMapping("/api/player/me")
    public ResponseEntity<Void> deleteMyData() {
        Player player = SecurityUtils.getCurrentPlayer();
        playerService.deletePlayerData(player);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/player/notifications")
    public ResponseEntity<List<NotificationResponse>> getPlayerNotifications() {
        Player player = SecurityUtils.getCurrentPlayer();
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        List<NotificationResponse> notifications = gameNotificationRepository
                .findByGameIdForTeam(gameId, teamId)
                .stream()
                .map(this::toNotificationResponse)
                .collect(Collectors.toList());
        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/api/player/notifications/unseen-count")
    public ResponseEntity<UnseenCountResponse> getUnseenNotificationCount() {
        Player player = SecurityUtils.getCurrentPlayer();
        UUID gameId = player.getTeam().getGame().getId();
        UUID teamId = player.getTeam().getId();
        Instant since = player.getLastNotificationsSeenAt() != null
                ? player.getLastNotificationsSeenAt()
                : Instant.EPOCH;
        long count = gameNotificationRepository.countUnseenForTeam(gameId, teamId, since);
        return ResponseEntity.ok(new UnseenCountResponse(count));
    }

    @PostMapping("/api/player/notifications/mark-seen")
    public ResponseEntity<Void> markNotificationsSeen() {
        Player player = SecurityUtils.getCurrentPlayer();
        player.setLastNotificationsSeenAt(Instant.now());
        playerRepository.save(player);
        return ResponseEntity.ok().build();
    }

    private NotificationResponse toNotificationResponse(GameNotification n) {
        return NotificationResponse.builder()
                .id(n.getId())
                .gameId(n.getGame().getId())
                .message(n.getMessage())
                .targetTeamId(n.getTargetTeam() != null ? n.getTargetTeam().getId() : null)
                .sentAt(n.getSentAt())
                .sentBy(n.getSentBy().getId())
                .build();
    }
}
