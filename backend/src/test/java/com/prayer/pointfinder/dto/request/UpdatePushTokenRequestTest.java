package com.prayer.pointfinder.dto.request;

import com.prayer.pointfinder.entity.PushPlatform;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class UpdatePushTokenRequestTest {

    @Test
    void defaultsToIosWhenPlatformIsMissing() {
        UpdatePushTokenRequest request = new UpdatePushTokenRequest();
        request.setPushToken("token-123");
        request.setPlatform(null);

        assertEquals(PushPlatform.ios, request.resolvePlatform());
    }

    @Test
    void resolvesAndroidPlatformWhenProvided() {
        UpdatePushTokenRequest request = new UpdatePushTokenRequest();
        request.setPushToken("token-123");
        request.setPlatform("android");

        assertEquals(PushPlatform.android, request.resolvePlatform());
    }
}
