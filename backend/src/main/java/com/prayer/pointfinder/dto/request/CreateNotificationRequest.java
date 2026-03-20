package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateNotificationRequest {
    @NotBlank
    @Size(max = 2000)
    private String message;

    private UUID targetTeamId; // null = broadcast
}
