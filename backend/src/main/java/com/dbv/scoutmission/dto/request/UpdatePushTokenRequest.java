package com.dbv.scoutmission.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdatePushTokenRequest {
    @NotBlank
    private String pushToken;
}
