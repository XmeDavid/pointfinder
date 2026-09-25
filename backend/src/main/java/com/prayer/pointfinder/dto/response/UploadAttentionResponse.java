package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.UUID;

/**
 * OW-18: one upload an operator should know about. {@code kind} is
 * {@code stalled} (still active, no progress since {@link #since}) or
 * {@code unlinked} (finished at {@link #since}, but no answer claimed it).
 * The player's app holds the bytes and retries; the operator contacts the team.
 */
public record UploadAttentionResponse(
        UUID sessionId,
        String kind,
        UUID teamId,
        String teamName,
        String playerName,
        String fileName,
        long totalBytes,
        long receivedBytes,
        Instant since
) {}
