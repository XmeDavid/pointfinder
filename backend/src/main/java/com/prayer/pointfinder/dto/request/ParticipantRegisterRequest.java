package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** Self-serve participant signup from the player app. */
@Data
public class ParticipantRegisterRequest {
    @NotBlank @Email @Size(max = 255)
    private String email;

    @NotBlank @Size(max = 255)
    private String name;

    @NotBlank @Size(min = 8, max = 128)
    private String password;

    /** Rate-limit key alongside the client IP, like join. */
    @NotBlank @Size(max = 128)
    private String deviceId;
}
