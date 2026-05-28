package com.prayer.pointfinder.security;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pure unit coverage for {@link JwtTokenProvider}'s startup secret
 * validation. The insecure default secret must be rejected on EVERY
 * profile (not just prod) unless the explicit {@code allow-insecure}
 * developer opt-in is set.
 */
class JwtSecretConfigurationTest {

    private static final String INSECURE_DEFAULT_SECRET =
            "scout-mission-dev-secret-key-that-is-at-least-256-bits-long-for-hs256";
    private static final String STRONG_SECRET =
            "a-strong-production-secret-that-is-at-least-256-bits-long-xyz";

    private JwtTokenProvider build(String secret, boolean allowInsecure) {
        JwtTokenProvider provider = new JwtTokenProvider();
        ReflectionTestUtils.setField(provider, "jwtSecret", secret);
        ReflectionTestUtils.setField(provider, "allowInsecureSecret", allowInsecure);
        ReflectionTestUtils.setField(provider, "accessTokenExpirationMs", 900000L);
        ReflectionTestUtils.setField(provider, "refreshTokenExpirationMs", 604800000L);
        return provider;
    }

    @Test
    void defaultSecretWithoutOptInFailsHard() {
        JwtTokenProvider provider = build(INSECURE_DEFAULT_SECRET, false);
        IllegalStateException ex = assertThrows(IllegalStateException.class, provider::init);
        org.junit.jupiter.api.Assertions.assertTrue(
                ex.getMessage().contains("insecure default"),
                "message must explain the insecure default was rejected");
    }

    @Test
    void defaultSecretWithExplicitOptInIsAllowed() {
        JwtTokenProvider provider = build(INSECURE_DEFAULT_SECRET, true);
        assertDoesNotThrow(provider::init);
    }

    @Test
    void strongSecretIsAlwaysAccepted() {
        JwtTokenProvider provider = build(STRONG_SECRET, false);
        assertDoesNotThrow(provider::init);
    }

    @Test
    void emptySecretIsRejected() {
        JwtTokenProvider provider = build("   ", false);
        assertThrows(IllegalStateException.class, provider::init);
    }

    @Test
    void shortSecretIsRejected() {
        JwtTokenProvider provider = build("too-short", false);
        IllegalStateException ex = assertThrows(IllegalStateException.class, provider::init);
        assertEquals("JWT secret must be at least 32 bytes", ex.getMessage());
    }
}
