package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class ActivityEventResponse {
    private UUID id;
    private UUID gameId;
    private String type;
    private UUID teamId;
    private UUID baseId;
    private UUID challengeId;
    private String message;
    private Instant timestamp;
}
