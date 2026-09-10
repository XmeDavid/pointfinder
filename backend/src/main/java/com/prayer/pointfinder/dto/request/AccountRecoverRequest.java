package com.prayer.pointfinder.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AccountRecoverRequest {
    @NotBlank
    @Size(max = 128, message = "Device ID must not exceed 128 characters")
    private String deviceId;
}
