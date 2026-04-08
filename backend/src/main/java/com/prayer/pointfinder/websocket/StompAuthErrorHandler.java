package com.prayer.pointfinder.websocket;

import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.StompSubProtocolErrorHandler;

import java.nio.charset.StandardCharsets;

/**
 * Converts authentication and authorisation exceptions thrown by
 * {@link WebSocketAuthChannelInterceptor} into well-formed STOMP ERROR frames.
 *
 * <p>Without this handler, an {@link AccessDeniedException} thrown from
 * {@code preSend()} propagates as a raw {@code MessageDeliveryException},
 * which Spring maps to a generic 500-class STOMP ERROR with no useful
 * context for the client. This handler intercepts the cause, detects
 * auth-related failures, and sends back a STOMP ERROR frame that includes:
 * <ul>
 *   <li>{@code message} header — human-readable reason</li>
 *   <li>{@code error-code} header — machine-readable code for client routing
 *       (e.g. {@code WS_ACCESS_DENIED}, {@code WS_AUTH_REQUIRED})</li>
 * </ul>
 *
 * <p>Registered in {@link com.prayer.pointfinder.config.WebSocketConfig} via
 * {@code registry.setErrorHandler(this)}.
 */
@Slf4j
@Component
public class StompAuthErrorHandler extends StompSubProtocolErrorHandler {

    private static final String ERROR_CODE_HEADER = "error-code";

    @Override
    public Message<byte[]> handleClientMessageProcessingError(
            Message<byte[]> clientMessage, Throwable ex) {

        Throwable cause = ex.getCause() != null ? ex.getCause() : ex;

        if (cause instanceof AccessDeniedException accessDenied) {
            String sessionId = null;
            String destination = null;
            String principalName = null;
            if (clientMessage != null) {
                StompHeaderAccessor clientAccessor =
                        MessageHeaderAccessor.getAccessor(clientMessage, StompHeaderAccessor.class);
                if (clientAccessor != null) {
                    sessionId = clientAccessor.getSessionId();
                    destination = clientAccessor.getDestination();
                    java.security.Principal user = clientAccessor.getUser();
                    principalName = user != null ? user.getName() : null;
                }
            }
            log.warn("[AUTH] operation=wsAccessDenied sessionId={} destination={} principal={} errorCode=WS_ACCESS_DENIED reason={}",
                    sessionId, destination, principalName, accessDenied.getMessage());
            return buildErrorFrame(clientMessage,
                    "You are not authorized to connect or subscribe",
                    "WS_ACCESS_DENIED");
        }

        // Fallback: delegate to default handler for unrecognised exceptions
        return super.handleClientMessageProcessingError(clientMessage, ex);
    }

    private Message<byte[]> buildErrorFrame(
            Message<byte[]> clientMessage, String errorMessage, String errorCode) {

        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.ERROR);
        accessor.setMessage(errorMessage);
        accessor.setNativeHeader(ERROR_CODE_HEADER, errorCode);
        accessor.setLeaveMutable(true);

        // Echo back the receipt id from the original frame if present (STOMP 1.1+)
        if (clientMessage != null) {
            StompHeaderAccessor clientAccessor =
                    MessageHeaderAccessor.getAccessor(clientMessage, StompHeaderAccessor.class);
            if (clientAccessor != null) {
                String receiptId = clientAccessor.getReceipt();
                if (receiptId != null) {
                    accessor.setReceiptId(receiptId);
                }
            }
        }

        return MessageBuilder.createMessage(
                errorMessage.getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());
    }
}
