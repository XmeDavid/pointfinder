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

    /** PF-01: which phone this registration belongs to. Older clients omit it and mean the player's own device. */
    @jakarta.validation.constraints.Size(max = 128)
    private String deviceId;

    @Pattern(regexp = "ios|android", message = "platform must be ios or android")
    private String platform;

    public PushPlatform resolvePlatform() {
        if (platform == null || platform.isBlank()) {
            return PushPlatform.ios;
        }
        return PushPlatform.valueOf(platform.toLowerCase(Locale.ROOT));
    }
}
