package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * Operator-facing tag DTO. Never exposed to players.
 */
@Data
@Builder
@AllArgsConstructor
public class TagResponse {
    private UUID id;
    private UUID gameId;
    private String label;
    private String color;
    private Instant createdAt;
    private Instant updatedAt;
}
