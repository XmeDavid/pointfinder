package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateNotificationRequest {
    @NotBlank
    private String message;

    private UUID targetTeamId; // null = broadcast
}
