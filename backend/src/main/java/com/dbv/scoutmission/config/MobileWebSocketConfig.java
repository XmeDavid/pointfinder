package com.dbv.scoutmission.config;

import com.dbv.scoutmission.websocket.MobileRealtimeWebSocketHandler;
import com.dbv.scoutmission.websocket.MobileWebSocketAuthHandshakeInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class MobileWebSocketConfig implements WebSocketConfigurer {

    @Value("${app.cors.allowed-origins}")
    private String allowedOrigins;

    private final MobileRealtimeWebSocketHandler mobileRealtimeWebSocketHandler;
    private final MobileWebSocketAuthHandshakeInterceptor mobileWebSocketAuthHandshakeInterceptor;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(mobileRealtimeWebSocketHandler, "/ws/mobile")
                .addInterceptors(mobileWebSocketAuthHandshakeInterceptor)
                .setAllowedOrigins(allowedOrigins.split(","));
    }
}

