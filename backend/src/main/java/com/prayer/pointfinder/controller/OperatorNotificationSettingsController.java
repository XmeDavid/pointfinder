package com.prayer.pointfinder.controller;

import com.prayer.pointfinder.dto.request.UpdateOperatorNotificationSettingsRequest;
import com.prayer.pointfinder.dto.response.OperatorNotificationSettingsResponse;
import com.prayer.pointfinder.service.OperatorNotificationSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/games/{gameId}/operator-notification-settings")
@RequiredArgsConstructor
public class OperatorNotificationSettingsController {

    private final OperatorNotificationSettingsService operatorNotificationSettingsService;

    @GetMapping("/me")
    public ResponseEntity<OperatorNotificationSettingsResponse> getCurrentUserSettings(@PathVariable UUID gameId) {
        return ResponseEntity.ok(operatorNotificationSettingsService.getCurrentUserSettings(gameId));
    }

    @PutMapping("/me")
    public ResponseEntity<OperatorNotificationSettingsResponse> updateCurrentUserSettings(
            @PathVariable UUID gameId,
            @Valid @RequestBody UpdateOperatorNotificationSettingsRequest request
    ) {
        return ResponseEntity.ok(operatorNotificationSettingsService.updateCurrentUserSettings(gameId, request));
    }
}

