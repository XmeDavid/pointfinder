package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.security.SecurityUtils;
import com.prayer.pointfinder.service.FileAccessService;
import com.prayer.pointfinder.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Serves uploaded files (submission photos) behind JWT authentication.
 * Replaces the previous unauthenticated nginx static file serving.
 * <p>
 * Player-authenticated users access via /api/player/files/{gameId}/{filename}.
 * Operator/admin-authenticated users access via /api/games/{gameId}/files/{filename}.
 */
@RestController
@RequiredArgsConstructor
public class FileController {

    private final FileAccessService fileAccessService;
    private final FileStorageService fileStorageService;

    /**
     * Player-authenticated file download.
     * Security: /api/player/** requires ROLE_PLAYER (enforced by SecurityConfig).
     */
    @GetMapping("/api/player/files/{gameId}/{filename}")
    public ResponseEntity<Resource> getFileAsPlayer(
            @PathVariable UUID gameId,
            @PathVariable String filename) {
        Player player = SecurityUtils.getCurrentPlayer();
        fileAccessService.ensurePlayerCanReadFile(gameId, filename, player);
        return serveFile(gameId, filename);
    }

    /**
     * Operator/admin-authenticated file download.
     * Security: /api/games/** requires ROLE_ADMIN or ROLE_OPERATOR (enforced by SecurityConfig).
     */
    @GetMapping("/api/games/{gameId}/files/{filename}")
    public ResponseEntity<Resource> getFileAsOperator(
            @PathVariable UUID gameId,
            @PathVariable String filename) {
        fileAccessService.ensureOperatorCanReadFile(gameId, filename);
        return serveFile(gameId, filename);
    }

    private ResponseEntity<Resource> serveFile(UUID gameId, String filename) {
        Resource resource = fileStorageService.loadFile(gameId, filename);

        String contentType = determineContentType(filename);

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=86400")
                .body(resource);
    }

    private String determineContentType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".mov")) return "video/quicktime";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
        return "image/jpeg";
    }
}
