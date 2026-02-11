package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.PlayerJoinRequest;
import com.dbv.scoutmission.dto.request.PlayerSubmissionRequest;
import com.dbv.scoutmission.dto.request.UpdateLocationRequest;
import com.dbv.scoutmission.dto.request.UpdatePushTokenRequest;
import com.dbv.scoutmission.dto.response.*;
import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.service.FileStorageService;
import com.dbv.scoutmission.service.PlayerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PlayerController {

    private final PlayerService playerService;
    private final FileStorageService fileStorageService;

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
}
