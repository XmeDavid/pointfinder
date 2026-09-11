package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.GamePublicationResponse;
import com.prayer.pointfinder.service.GamePublicationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** PF-07: featured curation. Platform admin only, gated at the filter chain and again in the service. */
@RestController
@RequestMapping("/api/admin/publications")
@RequiredArgsConstructor
public class AdminPublicationController {

    private final GamePublicationService publicationService;

    /** Every publication, drafts included, so curation can see what is and is not listed. */
    @GetMapping
    public ResponseEntity<List<GamePublicationResponse>> list() {
        return ResponseEntity.ok(publicationService.listAll());
    }

    @PostMapping("/{gameId}/feature")
    public ResponseEntity<GamePublicationResponse> feature(@PathVariable UUID gameId) {
        return ResponseEntity.ok(publicationService.setFeatured(gameId, true));
    }

    @PostMapping("/{gameId}/unfeature")
    public ResponseEntity<GamePublicationResponse> unfeature(@PathVariable UUID gameId) {
        return ResponseEntity.ok(publicationService.setFeatured(gameId, false));
    }
}
