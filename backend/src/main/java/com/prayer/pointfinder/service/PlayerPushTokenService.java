package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.PushPlatform;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PlayerPushTokenService {

    private final PushTokenService pushTokenService;

    @Transactional(timeout = 10)
    public void updatePushToken(UUID playerId, String deviceId, String pushToken, PushPlatform platform) {
        pushTokenService.registerPlayer(playerId, deviceId, pushToken, platform);
    }
}
