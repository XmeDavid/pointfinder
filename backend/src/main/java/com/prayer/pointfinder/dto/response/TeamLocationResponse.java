package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class TeamLocationResponse {
    private UUID teamId;
    private UUID playerId;
    private String displayName;
    private Double lat;
    private Double lng;
    private Instant updatedAt;
}
