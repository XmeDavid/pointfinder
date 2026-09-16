package com.prayer.pointfinder.dto.response;

import com.prayer.pointfinder.entity.GameLifecycleEvent;

import java.time.Instant;
import java.util.UUID;

/** One lifecycle transition of a game, oldest first when listed. */
public record GameLifecycleEventResponse(
        UUID id,
        String fromStatus,
        String toStatus,
        /** {@code operator}, {@code scheduled_end} or {@code practice_expired}. */
        String reason,
        /** Null for scheduler paths, or when the account was deleted. */
        UUID actorUserId,
        /** Name at the time; null for scheduler paths. */
        String actorName,
        boolean resetProgress,
        Instant createdAt
) {
    public static GameLifecycleEventResponse from(GameLifecycleEvent e) {
        return new GameLifecycleEventResponse(
                e.getId(),
                e.getFromStatus().name(),
                e.getToStatus().name(),
                e.getReason(),
                e.getActorUser() != null ? e.getActorUser().getId() : null,
                e.getActorNameSnapshot(),
                e.isResetProgress(),
                e.getCreatedAt());
    }
}
