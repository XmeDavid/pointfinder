package com.dbv.scoutmission.controller;

import com.dbv.scoutmission.dto.request.CreateChallengeRequest;
import com.dbv.scoutmission.dto.request.UpdateChallengeRequest;
import com.dbv.scoutmission.dto.response.ChallengeResponse;
import com.dbv.scoutmission.service.ChallengeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/challenges")
@RequiredArgsConstructor
public class ChallengeController {

    private final ChallengeService challengeService;

    @GetMapping
    public ResponseEntity<List<ChallengeResponse>> getChallenges(@PathVariable UUID gameId) {
        return ResponseEntity.ok(challengeService.getChallengesByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<ChallengeResponse> createChallenge(@PathVariable UUID gameId,
                                                              @Valid @RequestBody CreateChallengeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(challengeService.createChallenge(gameId, request));
    }

    @PutMapping("/{challengeId}")
    public ResponseEntity<ChallengeResponse> updateChallenge(@PathVariable UUID gameId,
                                                              @PathVariable UUID challengeId,
                                                              @Valid @RequestBody UpdateChallengeRequest request) {
        return ResponseEntity.ok(challengeService.updateChallenge(gameId, challengeId, request));
    }

    @DeleteMapping("/{challengeId}")
    public ResponseEntity<Void> deleteChallenge(@PathVariable UUID gameId, @PathVariable UUID challengeId) {
        challengeService.deleteChallenge(gameId, challengeId);
        return ResponseEntity.noContent().build();
    }
}
