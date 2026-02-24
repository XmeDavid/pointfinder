package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class UploadSessionResponse {
    private UUID sessionId;
    private UUID gameId;
    private String contentType;
    private long totalSizeBytes;
    private int chunkSizeBytes;
    private int totalChunks;
    private List<Integer> uploadedChunks;
    private String status;
    private String fileUrl;
    private Instant expiresAt;
}
