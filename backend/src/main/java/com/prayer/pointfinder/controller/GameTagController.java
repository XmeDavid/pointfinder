package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateTagRequest;
import com.prayer.pointfinder.dto.request.UpdateTagRequest;
import com.prayer.pointfinder.dto.response.TagResponse;
import com.prayer.pointfinder.service.GameTagService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Operator-only tag management endpoints.
 * Mount at {@code /api/games/{gameId}/tags}.
 */
@RestController
@RequestMapping("/api/games/{gameId}/tags")
@RequiredArgsConstructor
public class GameTagController {

    private final GameTagService gameTagService;

    @GetMapping
    public ResponseEntity<List<TagResponse>> listTags(@PathVariable UUID gameId) {
        return ResponseEntity.ok(gameTagService.listByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<TagResponse> createTag(@PathVariable UUID gameId,
                                                  @Valid @RequestBody CreateTagRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(gameTagService.createTag(gameId, request));
    }

    @PatchMapping("/{tagId}")
    public ResponseEntity<TagResponse> updateTag(@PathVariable UUID gameId,
                                                  @PathVariable UUID tagId,
                                                  @Valid @RequestBody UpdateTagRequest request) {
        return ResponseEntity.ok(gameTagService.updateTag(gameId, tagId, request));
    }

    @DeleteMapping("/{tagId}")
    public ResponseEntity<Void> deleteTag(@PathVariable UUID gameId,
                                           @PathVariable UUID tagId) {
        gameTagService.deleteTag(gameId, tagId);
        return ResponseEntity.noContent().build();
    }
}
