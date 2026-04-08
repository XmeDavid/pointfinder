package com.prayer.pointfinder.service;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Pure unit coverage for
 * {@link SubmissionService#deriveMarkCompletedIdempotencyKey(UUID, UUID, UUID, UUID)}.
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

    private static final UUID OPERATOR = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID TEAM = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID BASE = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final UUID CHALLENGE = UUID.fromString("44444444-4444-4444-4444-444444444444");

    @Test
    void identicalInputsProduceIdenticalKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        assertNotNull(a);
        assertEquals(a, b, "derivation must be deterministic");
    }

    @Test
    void differentOperatorProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                UUID.randomUUID(), TEAM, BASE, CHALLENGE);
        assertNotEquals(a, b);
    }

    @Test
    void differentTeamProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                OPERATOR, UUID.randomUUID(), BASE, CHALLENGE);
        assertNotEquals(a, b);
    }

    @Test
    void differentBaseProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                OPERATOR, TEAM, UUID.randomUUID(), CHALLENGE);
        assertNotEquals(a, b);
    }

    @Test
    void differentChallengeProducesDifferentKey() {
        UUID a = SubmissionService.deriveMarkCompletedIdempotencyKey(OPERATOR, TEAM, BASE, CHALLENGE);
        UUID b = SubmissionService.deriveMarkCompletedIdempotencyKey(
                OPERATOR, TEAM, BASE, UUID.randomUUID());
        assertNotEquals(a, b);
    }
}
