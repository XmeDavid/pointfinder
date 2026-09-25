package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * OW-23: realtime events an instance failed to deliver before they aged out
 * of the outbox. {@code total} counts every retained dead letter; {@code items}
 * are the most recent, newest first. Read-only: events are refresh signals,
 * clients converge on a snapshot, so they are inspected, never replayed.
 */
public record RealtimeDeadLettersResponse(long total, List<Item> items) {
    public record Item(long outboxId, String instanceId, UUID gameId, String audience, UUID teamId, String eventType,
                       String payload, int attempts, String lastError, Instant createdAt, Instant deadLetteredAt) {}
}
