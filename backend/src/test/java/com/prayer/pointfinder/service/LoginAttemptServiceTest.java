package com.prayer.pointfinder.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoginAttemptServiceTest {

    private LoginAttemptService service;

    @BeforeEach
    void setUp() {
        service = new LoginAttemptService();
    }

    @Test
    void notBlockedInitially() {
        assertFalse(service.isBlocked("user@example.com"));
    }

    @Test
    void notBlockedAfterFewFailures() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS - 1; i++) {
            service.recordFailure("user@example.com");
        }
        assertFalse(service.isBlocked("user@example.com"));
    }

    @Test
    void blockedAfterMaxAttempts() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("user@example.com");
        }
        assertTrue(service.isBlocked("user@example.com"));
    }

    @Test
    void resetOnSuccess() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("user@example.com");
        }
        assertTrue(service.isBlocked("user@example.com"));

        service.recordSuccess("user@example.com");
        assertFalse(service.isBlocked("user@example.com"));
        assertEquals(0, service.getAttemptCount("user@example.com"));
    }

    @Test
    void emailIsCaseInsensitive() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("User@Example.COM");
        }
        assertTrue(service.isBlocked("user@example.com"));
    }

    @Test
    void differentEmailsAreIndependent() {
        for (int i = 0; i < LoginAttemptService.MAX_ATTEMPTS; i++) {
            service.recordFailure("user1@example.com");
        }
        assertTrue(service.isBlocked("user1@example.com"));
        assertFalse(service.isBlocked("user2@example.com"));
    }

    @Test
    void failureIsCountedUntilTheWindowPasses() {
        // Expiry is by window (checked on read) and by the shared cleanup job,
        // not by a per-service sweep any more.
        service.recordFailure("user@example.com");
        assertEquals(1, service.getAttemptCount("user@example.com"));
        assertFalse(service.isBlocked("user@example.com"));
    }
}
