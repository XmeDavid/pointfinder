package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** PF-08: a signed-in phone joins a listed game with open admission. */
@Data
public class ExploreJoinRequest {
    @NotBlank
    @Size(max = 100, message = "Display name must not exceed 100 characters")
    private String displayName;

    @NotBlank
    @Size(max = 128, message = "Device ID must not exceed 128 characters")
    private String deviceId;
}
