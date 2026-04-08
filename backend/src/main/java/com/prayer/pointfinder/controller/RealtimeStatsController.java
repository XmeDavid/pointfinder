package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.RealtimeStatsResponse;
import com.prayer.pointfinder.service.GameAccessService;
import com.prayer.pointfinder.service.RealtimeMetricsService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Realtime health stats for the operator dashboard widget (P0 Track 2
 * Slice 5). Polled once every 30 s by the web admin.
 *
 * <p>Security: mounted under {@code /api/games/**}, which is role-gated
 * to {@code ADMIN}/{@code OPERATOR} by {@code SecurityConfig}. The
 * explicit access check ensures a non-admin operator can only see stats
 * for a game they own or are listed as an operator on.
 */
@RestController
@RequestMapping("/api/games")
@RequiredArgsConstructor
public class RealtimeStatsController {

    private final RealtimeMetricsService realtimeMetricsService;
    private final GameAccessService gameAccessService;

    @GetMapping("/{gameId}/realtime-stats")
    public ResponseEntity<RealtimeStatsResponse> getRealtimeStats(@PathVariable UUID gameId) {
        gameAccessService.ensureCurrentUserCanAccessGame(gameId);
        return ResponseEntity.ok(realtimeMetricsService.getStatsForGame(gameId));
    }
}
