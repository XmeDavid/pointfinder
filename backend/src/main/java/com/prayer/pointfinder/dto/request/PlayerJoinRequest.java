package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class PlayerJoinRequest {
    @NotBlank
    @Size(min = 6, max = 20, message = "Join code must be between 6 and 20 characters")
    private String joinCode;

    @NotBlank
    @Size(max = 100, message = "Display name must not exceed 100 characters")
    private String displayName;

    @NotBlank
    @Size(max = 128, message = "Device ID must not exceed 128 characters")
    private String deviceId;
}
