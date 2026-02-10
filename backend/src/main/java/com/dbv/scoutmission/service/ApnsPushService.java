package com.dbv.scoutmission.service;

import com.dbv.scoutmission.config.ApnsConfig;
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
import org.springframework.stereotype.Service;

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

    private ApnsClient apnsClient;

    @PostConstruct
    public void init() {
        if (!apnsConfig.isEnabled()) {
            log.info("APNs push notifications are disabled");
            return;
        }

        try {
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

                SimpleApnsPayloadBuilder payloadBuilder = new SimpleApnsPayloadBuilder()
                        .setAlertTitle(title)
                        .setAlertBody(body)
                        .setSound("default");

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
                        log.error("Failed to send push notification to token {}: {}", token, throwable.getMessage());
                    } else if (!response.isAccepted()) {
                        log.warn("Push notification rejected for token {}: {} (reason: {})",
                                token, response.getRejectionReason().orElse("unknown"),
                                response.getTokenInvalidationTimestamp().orElse(null));

                        // If token is invalid, it should be cleaned up
                        response.getTokenInvalidationTimestamp().ifPresent(ts ->
                                log.info("Token {} was invalidated at {}, should be removed", token, ts));
                    } else {
                        log.debug("Push notification accepted for token {}", token);
                    }
                });
            } catch (Exception e) {
                log.error("Error sending push to token {}: {}", token, e.getMessage(), e);
            }
        }
    }
}
