package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.response.RealtimeDeadLettersResponse;
import com.prayer.pointfinder.service.RealtimeDeadLetterService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** OW-23: read-only inspection of dead-lettered realtime events. Platform admin only. */
@RestController
@RequestMapping("/api/admin/realtime")
@RequiredArgsConstructor
public class AdminRealtimeController {

    private final RealtimeDeadLetterService deadLetterService;

    @GetMapping("/dead-letters")
    public ResponseEntity<RealtimeDeadLettersResponse> deadLetters(@RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(deadLetterService.recent(limit));
    }
}
