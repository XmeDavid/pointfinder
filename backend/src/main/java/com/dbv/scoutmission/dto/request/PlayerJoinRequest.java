package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PlayerJoinRequest {
    @NotBlank
    private String joinCode;

    @NotBlank
    private String displayName;

    @NotBlank
    private String deviceId;
}
