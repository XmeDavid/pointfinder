package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.GamePublicationRequest;
import com.prayer.pointfinder.dto.response.GamePublicationResponse;
import com.prayer.pointfinder.service.GamePublicationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * PF-07: the operator side of publishing. Lives under the game so the usual
 * game access rules (creator, operator, org member, admin) apply.
 */
@RestController
@RequestMapping("/api/games/{gameId}/publication")
@RequiredArgsConstructor
public class GamePublicationController {

    private final GamePublicationService publicationService;

    /** 404 until a draft is saved. */
    @GetMapping
    public ResponseEntity<GamePublicationResponse> get(@PathVariable UUID gameId) {
        return ResponseEntity.ok(publicationService.get(gameId));
    }

    /** Create or update the public summary. Does not list or delist. */
    @PutMapping
    public ResponseEntity<GamePublicationResponse> save(@PathVariable UUID gameId, @Valid @RequestBody GamePublicationRequest request) {
        return ResponseEntity.ok(publicationService.save(gameId, request));
    }

    @PostMapping("/publish")
    public ResponseEntity<GamePublicationResponse> publish(@PathVariable UUID gameId) {
        return ResponseEntity.ok(publicationService.publish(gameId));
    }

    @PostMapping("/unpublish")
    public ResponseEntity<GamePublicationResponse> unpublish(@PathVariable UUID gameId) {
        return ResponseEntity.ok(publicationService.unpublish(gameId));
    }
}
