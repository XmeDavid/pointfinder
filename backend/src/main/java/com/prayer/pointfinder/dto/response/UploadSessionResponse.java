package com.prayer.pointfinder.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record UploadSessionResponse(
    UUID sessionId, UUID gameId, String mediaItemKey, String originalFileName,
    String contentType, long totalSizeBytes, int chunkSizeBytes, int totalChunks,
    List<Integer> uploadedChunks, String status, String fileUrl,
    Instant expiresAt, Instant createdAt, Instant updatedAt, Instant completedAt
) {}
