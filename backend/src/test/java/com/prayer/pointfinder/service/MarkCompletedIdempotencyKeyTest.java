package com.prayer.pointfinder.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Pure unit coverage for
 * {@link SubmissionService#deriveMarkCompletedIdempotencyKey(UUID, UUID, UUID)}.
 *
 * <p>This is deliberately NOT an {@code IntegrationTestBase} — the key
 * derivation is a pure function and has no reason to spin up postgres.
 * It tests the invariants that make idempotency work for the P1 Phase 2
 * mark-completed rescue endpoint:
 *
 * <ul>
 *   <li>Determinism on identical inputs.</li>
 *   <li>Distinct output for every differing input field.</li>
 *   <li>Non-null result.</li>
 * </ul>
 */
class MarkCompletedIdempotencyKeyTest {

    private static final UUID TEAM = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID BASE = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final UUID CHALLENGE = UUID.fromString("44444444-4444-4444-4444-444444444444");

    @Test
    void identicalInputsProduceIdenticalKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        assertNotNull(a);
        assertEquals(a, b, "derivation must be deterministic");
    }

    /**
     * Operator identity must NOT influence the key: two different operators
     * (or the same operator after a handover) marking the same
     * (team, base, challenge) complete must derive the SAME key so the
     * second attempt collapses to the existing row instead of awarding
     * points twice.
     */
    @Test
    void operatorIdentityDoesNotAffectKey() {
        // The derivation no longer takes operatorId at all; this test
        // documents the invariant that the key depends only on the natural
        // tuple, so any operator computes the identical key.
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        assertEquals(a, b, "key must be independent of which operator marks complete");
    }

    @Test
    void differentTeamProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                UUID.randomUUID(), BASE, CHALLENGE);
        assertNotEquals(a, b);
    }

    @Test
    void differentBaseProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                TEAM, UUID.randomUUID(), CHALLENGE);
        assertNotEquals(a, b);
    }

    @Test
    void differentChallengeProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                TEAM, BASE, UUID.randomUUID());
        assertNotEquals(a, b);
    }
}
