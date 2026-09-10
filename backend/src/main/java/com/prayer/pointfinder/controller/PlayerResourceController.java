package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.ResourceResponse;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.ResourceEmbedService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * Files and documents a team may see. Visibility is decided in
 * {@link ResourceEmbedService} so the list and the download agree.
 */
@RestController
@RequestMapping("/api/player/games/{gameId}")
@RequiredArgsConstructor
public class PlayerResourceController {

    private final ResourceEmbedService resourceEmbedService;

    @GetMapping("/files")
    public ResponseEntity<List<ResourceResponse>> getPlayerFiles(@PathVariable UUID gameId) {
        Player player = SecurityUtils.getCurrentPlayer();
        return ResponseEntity.ok(resourceEmbedService.getPlayerVisibleResources(gameId, player.getTeam().getId()));
    }

    @GetMapping("/resources/{resourceId}/download")
    public ResponseEntity<Void> downloadResource(
            @PathVariable UUID gameId,
            @PathVariable UUID resourceId) {
        Player player = SecurityUtils.getCurrentPlayer();
        String url = resourceEmbedService.getDownloadUrlForPlayer(gameId, player.getTeam().getId(), resourceId);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header("Location", url)
                .header("Cache-Control", "private, max-age=3500")
                .build();
    }
}
