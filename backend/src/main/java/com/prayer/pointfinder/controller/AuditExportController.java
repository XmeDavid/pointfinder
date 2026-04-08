package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.service.AuditExportService;
import com.prayer.pointfinder.service.AuditExportService.AuditExportQuery;
import com.prayer.pointfinder.service.AuditExportService.AuditExportResult;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Controller for the P1 Phase 3 activity audit export.
 *
 * <p>The endpoint lives at {@code /api/games/{gameId}/audit-export} rather
 * than under {@code /monitoring/} because the export is a reviewer-facing
 * product action, not a live dashboard feed, and keeping it at the game
 * level makes the URL self-explanatory in operator tooling and scripts.
 *
 * <p>Security: the blanket {@code /api/games/**} matcher in
 * {@link com.prayer.pointfinder.config.SecurityConfig} already requires
 * {@code ROLE_ADMIN} or {@code ROLE_OPERATOR}. The service additionally
 * calls {@link com.prayer.pointfinder.service.GameAccessService#ensureCurrentUserCanAccessGame(java.util.UUID)}
 * so only operators on the specific game (or admins) can call this path.
 *
 * <p>The controller is deliberately thin: it forwards query parameters into
 * the {@link AuditExportService} as a single {@link AuditExportQuery} record
 * and returns the rendered body with the content-type and content-disposition
 * headers the service selected. All filter parsing, access enforcement, and
 * format adaptation lives in the service layer for testability.
 */
@RestController
@RequestMapping("/api/games/{gameId}")
@RequiredArgsConstructor
public class AuditExportController {

    private final AuditExportService auditExportService;

    @GetMapping("/audit-export")
    public ResponseEntity<String> exportAudit(
            @PathVariable UUID gameId,
            @RequestParam(name = "format", required = false) String format,
            @RequestParam(name = "from", required = false) String from,
            @RequestParam(name = "to", required = false) String to,
            @RequestParam(name = "teamId", required = false) UUID teamId,
            @RequestParam(name = "playerId", required = false) UUID playerId,
            @RequestParam(name = "operatorId", required = false) UUID operatorId,
            @RequestParam(name = "actionType", required = false) String actionType,
            @RequestParam(name = "sourceSurface", required = false) String sourceSurface,
            @RequestParam(name = "includeArchived", required = false) Boolean includeArchived
    ) {
        AuditExportQuery query = new AuditExportQuery(
                gameId,
                format,
                from,
                to,
                teamId,
                playerId,
                operatorId,
                actionType,
                sourceSurface,
                includeArchived
        );
        AuditExportResult result = auditExportService.export(query);

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_TYPE, result.contentType());
        headers.set(HttpHeaders.CONTENT_DISPOSITION, result.contentDisposition());

        return ResponseEntity.ok()
                .headers(headers)
                .body(result.body());
    }
}
