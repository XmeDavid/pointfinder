package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.service.BroadcastService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Unauthenticated broadcast endpoints for public game viewers.
 *
 * <p><strong>Security (audit 12.3):</strong> These endpoints are fully
 * unauthenticated and accept a broadcast code as a path parameter.
 * The broadcast code is 10 characters from a 28-char alphabet (~280
 * trillion combinations after V57 widening), making brute-force
 * impractical. Additionally, nginx enforces a {@code broadcast_limit}
 * rate-limit zone (10 requests/minute per IP, burst=5) on
 * {@code /api/broadcast/} to further mitigate enumeration attempts.
 * The combination of code entropy and rate limiting provides adequate
 * protection for the broadcast data (which includes team locations).
 */
@RestController
@RequestMapping("/api/broadcast")
@RequiredArgsConstructor
public class BroadcastController {

    private final BroadcastService broadcastService;

    @GetMapping("/{code}")
    public ResponseEntity<BroadcastDataResponse> getBroadcastData(@PathVariable String code) {
        return ResponseEntity.ok(broadcastService.getBroadcastData(code));
    }

    @GetMapping("/{code}/leaderboard")
    public ResponseEntity<List<LeaderboardEntry>> getLeaderboard(@PathVariable String code) {
        return ResponseEntity.ok(broadcastService.getLeaderboard(code));
    }

    @GetMapping("/{code}/locations")
    public ResponseEntity<List<TeamLocationResponse>> getLocations(@PathVariable String code) {
        return ResponseEntity.ok(broadcastService.getLocations(code));
    }

    @GetMapping("/{code}/progress")
    public ResponseEntity<List<TeamBaseProgressResponse>> getProgress(@PathVariable String code) {
        return ResponseEntity.ok(broadcastService.getProgress(code));
    }
}
