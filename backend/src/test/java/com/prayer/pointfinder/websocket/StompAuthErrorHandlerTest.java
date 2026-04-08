package com.prayer.pointfinder.websocket;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Verifies that {@link StompAuthErrorHandler} converts WebSocket auth
 * exceptions into well-formed STOMP ERROR frames with machine-readable
 * {@code error-code} headers instead of letting them fall through as
 * opaque 500-class frames.
 */
class StompAuthErrorHandlerTest {

    private StompAuthErrorHandler handler;

    @BeforeEach
    void setUp() {
        handler = new StompAuthErrorHandler();
    }

    @Test
    void accessDeniedExceptionProducesStompErrorFrameWithWsAccessDeniedCode() {
        // Simulate the MessageDeliveryException wrapping pattern Spring uses
        // when a ChannelInterceptor throws from preSend().
        AccessDeniedException cause = new AccessDeniedException("Invalid or missing WebSocket token");
        RuntimeException wrapper = new RuntimeException("wrapped", cause);

        Message<byte[]> result = handler.handleClientMessageProcessingError(null, wrapper);

        assertNotNull(result, "error handler must return a non-null ERROR frame");

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);
        assertEquals(StompCommand.ERROR, accessor.getCommand(),
                "resulting frame must use STOMP ERROR command");

        List<String> errorCodes = accessor.getNativeHeader("error-code");
        assertNotNull(errorCodes, "ERROR frame must include error-code header");
        assertFalse(errorCodes.isEmpty(), "error-code header must not be empty");
        assertEquals("WS_ACCESS_DENIED", errorCodes.get(0),
                "error-code must be WS_ACCESS_DENIED for AccessDeniedException");

        String body = new String(result.getPayload(), StandardCharsets.UTF_8);
        assertFalse(body.isBlank(), "ERROR frame body must contain a human-readable message");
    }

    @Test
    void accessDeniedAsCauseOfCauseIsHandled() {
        // AccessDeniedException may be one level deeper in some Spring STOMP paths.
        AccessDeniedException root = new AccessDeniedException("Player cannot subscribe to another game topic");
        RuntimeException wrapper = new RuntimeException("outer", root);

        Message<byte[]> result = handler.handleClientMessageProcessingError(null, wrapper);

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);
        assertEquals(StompCommand.ERROR, accessor.getCommand());
        List<String> errorCodes = accessor.getNativeHeader("error-code");
        assertNotNull(errorCodes);
        assertEquals("WS_ACCESS_DENIED", errorCodes.get(0));
    }

    @Test
    void accessDeniedDirectlyAsExceptionIsHandled() {
        // AccessDeniedException thrown directly (no wrapper).
        AccessDeniedException ex = new AccessDeniedException("WebSocket user not found");

        Message<byte[]> result = handler.handleClientMessageProcessingError(null, ex);

        assertNotNull(result);
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);
        assertEquals(StompCommand.ERROR, accessor.getCommand());
        List<String> codes = accessor.getNativeHeader("error-code");
        assertNotNull(codes);
        assertEquals("WS_ACCESS_DENIED", codes.get(0));
    }

    @Test
    void receiptIdFromClientFrameIsEchoedInErrorFrame() {
        // STOMP 1.1+: client may include a receipt header; error frame must echo it.
        StompHeaderAccessor clientAccessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        clientAccessor.setReceipt("receipt-42");
        clientAccessor.setLeaveMutable(true);
        Message<byte[]> clientMessage = MessageBuilder.createMessage(
                new byte[0], clientAccessor.getMessageHeaders());

        AccessDeniedException cause = new AccessDeniedException("bad token");
        RuntimeException wrapper = new RuntimeException("wrapped", cause);

        Message<byte[]> result = handler.handleClientMessageProcessingError(clientMessage, wrapper);

        StompHeaderAccessor resultAccessor = StompHeaderAccessor.wrap(result);
        assertEquals("receipt-42", resultAccessor.getReceiptId(),
                "error frame must echo the client receipt id");
    }
}
