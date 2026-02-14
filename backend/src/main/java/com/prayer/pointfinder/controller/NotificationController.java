package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.CreateNotificationRequest;
import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public ResponseEntity<List<NotificationResponse>> getNotifications(@PathVariable UUID gameId) {
        return ResponseEntity.ok(notificationService.getNotificationsByGame(gameId));
    }

    @PostMapping
    public ResponseEntity<NotificationResponse> createNotification(@PathVariable UUID gameId,
                                                                    @Valid @RequestBody CreateNotificationRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(notificationService.createNotification(gameId, request));
    }
}
