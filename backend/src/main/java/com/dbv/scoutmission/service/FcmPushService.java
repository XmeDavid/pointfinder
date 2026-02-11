package com.dbv.scoutmission.service;

import com.dbv.scoutmission.config.FcmConfig;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.MulticastMessage;
import com.google.firebase.messaging.Notification;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;

@Slf4j
@Service
@RequiredArgsConstructor
public class FcmPushService {

    private final FcmConfig fcmConfig;
    private final ResourceLoader resourceLoader;

    private FirebaseApp firebaseApp;

    @PostConstruct
    public void init() {
        if (!fcmConfig.isEnabled()) {
            log.info("FCM push notifications are disabled");
            return;
        }

        try {
            Resource resource = resourceLoader.getResource(fcmConfig.getCredentialsPath());
            try (InputStream stream = resource.getInputStream()) {
                FirebaseOptions.Builder optionsBuilder = FirebaseOptions.builder()
                        .setCredentials(GoogleCredentials.fromStream(stream));
                if (fcmConfig.getProjectId() != null && !fcmConfig.getProjectId().isBlank()) {
                    optionsBuilder.setProjectId(fcmConfig.getProjectId());
                }
                FirebaseOptions options = optionsBuilder.build();
                firebaseApp = FirebaseApp.initializeApp(options, "dbv-fcm");
                log.info("FCM client initialized successfully");
            }
        } catch (Exception e) {
            log.error("Failed to initialize FCM client: {}", e.getMessage(), e);
        }
    }

    @PreDestroy
    public void shutdown() {
        if (firebaseApp != null) {
            firebaseApp.delete();
        }
    }

    public void sendPush(List<String> tokens, String title, String body, Map<String, String> customData) {
        if (!fcmConfig.isEnabled() || firebaseApp == null) {
            log.debug("FCM disabled or not initialized, skipping push to {} tokens", tokens.size());
            return;
        }

        if (tokens.isEmpty()) {
            log.debug("No FCM tokens to send to");
            return;
        }

        try {
            MulticastMessage.Builder builder = MulticastMessage.builder()
                    .addAllTokens(tokens)
                    .setNotification(Notification.builder().setTitle(title).setBody(body).build());
            if (customData != null && !customData.isEmpty()) {
                builder.putAllData(customData);
            }
            var response = FirebaseMessaging.getInstance(firebaseApp).sendEachForMulticastAsync(builder.build()).get();
            if (response.getFailureCount() > 0) {
                for (int i = 0; i < response.getResponses().size(); i++) {
                    var sendResponse = response.getResponses().get(i);
                    if (!sendResponse.isSuccessful()) {
                        log.warn("FCM push failed for token {}: {}",
                                maskToken(tokens.get(i)),
                                sendResponse.getException() != null ? sendResponse.getException().getMessage() : "unknown");
                    }
                }
            } else {
                log.debug("FCM push notifications sent successfully to {} devices", tokens.size());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("FCM send interrupted: {}", e.getMessage(), e);
        } catch (ExecutionException e) {
            log.error("FCM send execution failed: {}", e.getMessage(), e);
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
