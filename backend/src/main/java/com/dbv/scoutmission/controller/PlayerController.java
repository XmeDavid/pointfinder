package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.PlayerJoinRequest;
import com.dbv.scoutmission.dto.request.PlayerSubmissionRequest;
import com.dbv.scoutmission.dto.response.*;
import com.dbv.scoutmission.entity.Player;
import com.dbv.scoutmission.security.SecurityUtils;
import com.dbv.scoutmission.service.PlayerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class PlayerController {

    private final PlayerService playerService;

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
        return ResponseEntity.ok(playerService.getBases(gameId));
    }

    @PostMapping("/api/player/games/{gameId}/submissions")
    public ResponseEntity<SubmissionResponse> submitAnswer(@PathVariable UUID gameId,
                                                            @Valid @RequestBody PlayerSubmissionRequest request) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(playerService.submitAnswer(gameId, request, player));
    }
}
