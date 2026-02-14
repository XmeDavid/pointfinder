package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateAssignmentRequest {
    @NotNull
    private UUID baseId;

    @NotNull
    private UUID challengeId;

    private UUID teamId; // null = all teams
}
