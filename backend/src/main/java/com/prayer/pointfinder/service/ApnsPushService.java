package com.prayer.pointfinder.service;

import com.prayer.pointfinder.config.ApnsConfig;
import com.prayer.pointfinder.repository.PlayerRepository;
import com.eatthepath.pushy.apns.ApnsClient;
import com.eatthepath.pushy.apns.ApnsClientBuilder;
import com.eatthepath.pushy.apns.PushNotificationResponse;
import com.eatthepath.pushy.apns.auth.ApnsSigningKey;
import com.eatthepath.pushy.apns.util.SimpleApnsPayloadBuilder;
import com.eatthepath.pushy.apns.util.SimpleApnsPushNotification;
import com.eatthepath.pushy.apns.util.TokenUtil;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ResourceLoader;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApnsPushService {

    private final ApnsConfig apnsConfig;
    private final ResourceLoader resourceLoader;
    private final PlayerRepository playerRepository;

    private ApnsClient apnsClient;

    @PostConstruct
    public void init() {
        if (!apnsConfig.isEnabled()) {
            log.info("APNs push notifications are disabled");
            return;
        }

        try {
            log.info("Initializing APNs client (production={}), keyPath='{}', keyId='{}', teamId='{}', bundleId='{}'",
                    apnsConfig.isProduction(),
                    apnsConfig.getKeyPath(),
                    apnsConfig.getKeyId(),
                    apnsConfig.getTeamId(),
                    apnsConfig.getBundleId());

            InputStream keyStream = resourceLoader.getResource(apnsConfig.getKeyPath()).getInputStream();

            ApnsSigningKey signingKey = ApnsSigningKey.loadFromInputStream(
                    keyStream, apnsConfig.getTeamId(), apnsConfig.getKeyId());

            String host = apnsConfig.isProduction()
                    ? ApnsClientBuilder.PRODUCTION_APNS_HOST
                    : ApnsClientBuilder.DEVELOPMENT_APNS_HOST;

            apnsClient = new ApnsClientBuilder()
                    .setApnsServer(host)
                    .setSigningKey(signingKey)
                    .build();

            log.info("APNs client initialized successfully (production={})", apnsConfig.isProduction());
        } catch (Exception e) {
            log.error("Failed to initialize APNs client: {}", e.getMessage(), e);
        }
    }

    @PreDestroy
    public void shutdown() {
        if (apnsClient != null) {
            try {
                apnsClient.close().get();
            } catch (Exception e) {
                log.warn("Error shutting down APNs client: {}", e.getMessage());
            }
        }
    }

    /**
     * Send a push notification to a list of device tokens.
     *
     * @param tokens   List of APNs device tokens
     * @param title    Notification title
     * @param body     Notification body text
     * @param customData Additional data to include in the payload
     */
    @Async("pushNotificationExecutor")
    public void sendPush(List<String> tokens, String title, String body, Map<String, String> customData) {
        if (!apnsConfig.isEnabled() || apnsClient == null) {
            log.debug("APNs disabled or not initialized, skipping push to {} tokens", tokens.size());
            return;
        }

        if (tokens.isEmpty()) {
            log.debug("No push tokens to send to");
            return;
        }

        String topic = apnsConfig.getBundleId();

        for (String token : tokens) {
            try {
                String sanitizedToken = TokenUtil.sanitizeTokenString(token);
                String maskedToken = maskToken(token);

                SimpleApnsPayloadBuilder payloadBuilder = new SimpleApnsPayloadBuilder();
                payloadBuilder.setAlertTitle(title);
                payloadBuilder.setAlertBody(body);
                payloadBuilder.setSound("default");

                if (customData != null) {
                    for (Map.Entry<String, String> entry : customData.entrySet()) {
                        payloadBuilder.addCustomProperty(entry.getKey(), entry.getValue());
                    }
                }

                String payload = payloadBuilder.build();

                SimpleApnsPushNotification pushNotification = new SimpleApnsPushNotification(
                        sanitizedToken, topic, payload,
                        Instant.now().plusSeconds(86400), // 24h expiry
                        com.eatthepath.pushy.apns.DeliveryPriority.IMMEDIATE,
                        com.eatthepath.pushy.apns.PushType.ALERT);

                CompletableFuture<PushNotificationResponse<SimpleApnsPushNotification>> future =
                        apnsClient.sendNotification(pushNotification);

                future.whenComplete((response, throwable) -> {
                    if (throwable != null) {
                        log.error("Failed to send push notification to token {}: {}", maskedToken, throwable.getMessage());
                    } else if (!response.isAccepted()) {
                        log.warn("Push notification rejected for token {}: {} (reason: {})",
                                maskedToken, response.getRejectionReason().orElse("unknown"),
                                response.getTokenInvalidationTimestamp().orElse(null));

                        // Clean up invalid tokens from the database
                        if (response.getTokenInvalidationTimestamp().isPresent()) {
                            cleanupInvalidToken(token);
                        }
                    } else {
                        log.debug("Push notification accepted for token {}", maskedToken);
                    }
                });
            } catch (Exception e) {
                log.error("Error sending push to token {}: {}", maskToken(token), e.getMessage(), e);
            }
        }
    }

    @Transactional
    private void cleanupInvalidToken(String token) {
        try {
            playerRepository.setInvalidPushTokenToNull(token);
            log.info("Cleaned up invalid push token from database");
        } catch (Exception e) {
            log.warn("Failed to clean up invalid push token: {}", e.getMessage());
        }
    }

    private String maskToken(String token) {
        if (token == null || token.isBlank()) {
            return "unknown";
        }

        int prefixLength = Math.min(8, token.length());
        int suffixLength = token.length() > 12 ? 4 : 0;
        if (suffixLength == 0) {
            return token.substring(0, prefixLength) + "***";
        }

        return token.substring(0, prefixLength) + "..." + token.substring(token.length() - suffixLength);
    }
}
