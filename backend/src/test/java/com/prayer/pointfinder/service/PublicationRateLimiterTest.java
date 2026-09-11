package com.prayer.pointfinder.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PublicationRateLimiterTest {

    @Test
    void allowsTheCeilingThenStopsOneAccountWithoutTouchingAnother() {
        PublicationRateLimiter limiter = new PublicationRateLimiter();
        UUID busy = UUID.randomUUID();
        UUID other = UUID.randomUUID();
        for (int i = 0; i < PublicationRateLimiter.MAX_MUTATIONS; i++) {
            assertTrue(limiter.tryAcquire(busy), "mutation " + (i + 1) + " is within the ceiling");
        }
        assertFalse(limiter.tryAcquire(busy), "one past the ceiling is refused");
        assertTrue(limiter.tryAcquire(other), "another account keeps its own bucket");
    }
}
