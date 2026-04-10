package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateStageRequest;
import com.prayer.pointfinder.dto.request.ReorderRequest;
import com.prayer.pointfinder.dto.request.UpdateStageRequest;
import com.prayer.pointfinder.dto.response.StageResponse;
import com.prayer.pointfinder.service.StageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/stages")
@RequiredArgsConstructor
public class StageController {

    private final StageService stageService;

    @GetMapping
    public ResponseEntity<List<StageResponse>> getStages(@PathVariable UUID gameId) {
        return ResponseEntity.ok(stageService.getStages(gameId));
    }

    @PostMapping
    public ResponseEntity<StageResponse> createStage(
            @PathVariable UUID gameId,
            @Valid @RequestBody CreateStageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(stageService.createStage(gameId, request));
    }

    @PutMapping("/{stageId}")
    public ResponseEntity<StageResponse> updateStage(
            @PathVariable UUID gameId,
            @PathVariable UUID stageId,
            @Valid @RequestBody UpdateStageRequest request) {
        return ResponseEntity.ok(stageService.updateStage(gameId, stageId, request));
    }

    @DeleteMapping("/{stageId}")
    public ResponseEntity<Void> deleteStage(
            @PathVariable UUID gameId,
            @PathVariable UUID stageId) {
        stageService.deleteStage(gameId, stageId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/reorder")
    public ResponseEntity<Void> reorderStages(
            @PathVariable UUID gameId,
            @Valid @RequestBody ReorderRequest request) {
        stageService.reorderStages(gameId, request);
        return ResponseEntity.ok().build();
    }
}
