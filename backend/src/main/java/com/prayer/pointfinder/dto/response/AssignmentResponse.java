package com.prayer.pointfinder.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
@AllArgsConstructor
public class AssignmentResponse {
    private UUID id;
    private UUID gameId;
    private UUID baseId;
    private UUID challengeId;
    private UUID teamId;
}
