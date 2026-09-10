package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.UUID;

/** Recover an account's existing participation on this device. The game comes from either field. */
@Data
public class PlayerRecoverRequest {
    @NotBlank @Email @Size(max = 255)
    private String email;

    @NotBlank @Size(max = 128)
    private String password;

    @NotBlank @Size(max = 128, message = "Device ID must not exceed 128 characters")
    private String deviceId;

    @Size(min = 6, max = 20, message = "Join code must be between 6 and 20 characters")
    private String joinCode;

    private UUID gameId;
}
