package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.UploadAttentionResponse;
import com.prayer.pointfinder.service.UploadAttentionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** OW-18: stalled and unlinked uploads for the game's operators. Under the operator-only {@code /api/games/**}. */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class UploadAttentionController {

    private final UploadAttentionService uploadAttentionService;

    @GetMapping("/{gameId}/uploads/attention")
    public ResponseEntity<List<UploadAttentionResponse>> attention(@PathVariable UUID gameId) {
        return ResponseEntity.ok(uploadAttentionService.list(gameId));
    }
}
