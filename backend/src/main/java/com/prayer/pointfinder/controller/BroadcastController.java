package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.service.BroadcastService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
