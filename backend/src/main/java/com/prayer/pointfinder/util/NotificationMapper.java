package com.prayer.pointfinder.util;

import com.prayer.pointfinder.dto.response.NotificationResponse;
import com.prayer.pointfinder.entity.GameNotification;

/**
 * Shared mapper for converting GameNotification entities to response DTOs.
 * Centralizes the mapping logic to avoid duplication.
 */
public final class NotificationMapper {

    private NotificationMapper() {
        // Utility class
    }

    public static NotificationResponse toResponse(GameNotification n) {
        return new NotificationResponse(
                n.getId(),
                n.getGame().getId(),
                n.getMessage(),
                n.getTargetTeam() != null ? n.getTargetTeam().getId() : null,
                n.getSentAt(),
                n.getSentBy() != null ? n.getSentBy().getId() : null
        );
    }
}
