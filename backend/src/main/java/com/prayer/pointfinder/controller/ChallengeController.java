package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateChallengeRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateChallengeRequest;
import com.prayer.pointfinder.dto.response.ChallengeResponse;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.service.ChallengeService;
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

    private static final String IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

    private final ChallengeService challengeService;

    @GetMapping
    public ResponseEntity<List<ChallengeResponse>> getChallenges(@PathVariable UUID gameId) {
        return ResponseEntity.ok(challengeService.getChallengesByGame(gameId));
    }

    /**
     * Creates a challenge. An optional idempotency key — body field
     * {@code idempotencyKey}, or the {@code Idempotency-Key} header when the
     * body has none — makes a retry of the same create return the challenge
     * already made for that key in this game (OW-04). Fresh creates and
     * replays both answer 201 with the standard {@link ChallengeResponse}, so
     * a client that lost the first response needs no special handling.
     */
    @PostMapping
    public ResponseEntity<ChallengeResponse> createChallenge(@PathVariable UUID gameId,
                                                              @Valid @RequestBody CreateChallengeRequest request,
                                                              @RequestHeader(value = IDEMPOTENCY_KEY_HEADER, required = false)
                                                              String idempotencyKeyHeader) {
        if (request.getIdempotencyKey() == null && idempotencyKeyHeader != null && !idempotencyKeyHeader.isBlank()) {
            request.setIdempotencyKey(parseIdempotencyKey(idempotencyKeyHeader));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(challengeService.createChallengeIdempotent(gameId, request));
    }

    private static UUID parseIdempotencyKey(String header) {
        try {
            return UUID.fromString(header.trim());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException(IDEMPOTENCY_KEY_HEADER + " header must be a UUID");
        }
    }

    @PutMapping("/{challengeId}")
    public ResponseEntity<ChallengeResponse> updateChallenge(@PathVariable UUID gameId,
                                                              @PathVariable UUID challengeId,
                                                              @Valid @RequestBody UpdateChallengeRequest request) {
        return ResponseEntity.ok(challengeService.updateChallenge(gameId, challengeId, request));
    }

    @PatchMapping("/reorder")
    public ResponseEntity<Void> reorderChallenges(@PathVariable UUID gameId,
                                                    @Valid @RequestBody ReorderRequest request) {
        challengeService.reorderChallenges(gameId, request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{challengeId}")
    public ResponseEntity<Void> deleteChallenge(@PathVariable UUID gameId, @PathVariable UUID challengeId) {
        challengeService.deleteChallenge(gameId, challengeId);
        return ResponseEntity.noContent().build();
    }
}
