package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.entity.PushPlatform;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

import java.util.Locale;

@Data
public class UpdatePushTokenRequest {
    @NotBlank
    private String pushToken;

    @Pattern(regexp = "ios|android", message = "platform must be ios or android")
    private String platform;

    public PushPlatform resolvePlatform() {
        if (platform == null || platform.isBlank()) {
            return PushPlatform.ios;
        }
        return PushPlatform.valueOf(platform.toLowerCase(Locale.ROOT));
    }
}
