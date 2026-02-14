package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.service.MonitoringService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/monitoring")
@RequiredArgsConstructor
public class MonitoringController {

    private final MonitoringService monitoringService;

    @GetMapping("/dashboard")
    public ResponseEntity<DashboardResponse> getDashboard(@PathVariable UUID gameId) {
        return ResponseEntity.ok(monitoringService.getDashboard(gameId));
    }

    @GetMapping("/leaderboard")
    public ResponseEntity<List<LeaderboardEntry>> getLeaderboard(@PathVariable UUID gameId) {
        return ResponseEntity.ok(monitoringService.getLeaderboard(gameId));
    }

    @GetMapping("/activity")
    public ResponseEntity<List<ActivityEventResponse>> getActivity(@PathVariable UUID gameId) {
        return ResponseEntity.ok(monitoringService.getActivity(gameId));
    }

    @GetMapping("/locations")
    public ResponseEntity<List<TeamLocationResponse>> getLocations(@PathVariable UUID gameId) {
        return ResponseEntity.ok(monitoringService.getLocations(gameId));
    }

    @GetMapping("/progress")
    public ResponseEntity<List<TeamBaseProgressResponse>> getProgress(@PathVariable UUID gameId) {
        return ResponseEntity.ok(monitoringService.getProgress(gameId));
    }
}
