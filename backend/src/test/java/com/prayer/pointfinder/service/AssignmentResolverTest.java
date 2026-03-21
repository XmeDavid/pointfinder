package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Unit tests for AssignmentResolver — the stateless utility that resolves which
 * challenge a team faces at a given base.
 *
 * Resolution priority (highest to lowest):
 *   1. Team-specific assignment for this base (most recent wins)
 *   2. Global (team=null) assignment for this base (most recent wins)
 *   3. Base's fixedChallenge
 *   4. null (no challenge configured)
 *
 * Also covers RECENCY_COMPARATOR ordering.
 */
class AssignmentResolverTest {

    // ── Helper builders ──────────────────────────────────────────────

    private Challenge challenge(String title) {
        return Challenge.builder()
                .id(UUID.randomUUID())
                .title(title)
                .description("").content("").completionContent("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(10)
                .locationBound(false)
                .build();
    }

    private Base base() {
        return Base.builder()
                .id(UUID.randomUUID())
                .name("Base")
                .description("").lat(47.0).lng(8.0)
                .nfcLinked(true)
                .build();
    }

    private Base baseWithFixed(Challenge fixed) {
        Base b = base();
        b.setFixedChallenge(fixed);
        return b;
    }

    private Team team() {
        return Team.builder()
                .id(UUID.randomUUID())
                .name("Team")
                .joinCode("CODE1")
                .color("#FF0000")
                .build();
    }

    private Assignment teamAssignment(Base b, Challenge c, Team t, Instant createdAt) {
        Assignment a = Assignment.builder()
                .id(UUID.randomUUID())
                .base(b).challenge(c).team(t)
                .build();
        a.setCreatedAt(createdAt);
        return a;
    }

    private Assignment globalAssignment(Base b, Challenge c, Instant createdAt) {
        Assignment a = Assignment.builder()
                .id(UUID.randomUUID())
                .base(b).challenge(c).team(null)
                .build();
        a.setCreatedAt(createdAt);
        return a;
    }

    // ── resolve() — happy paths ──────────────────────────────────────

    @Test
    void returnsTeamSpecificChallenge_whenTeamAssignmentExists() {
        Base b = base();
        Team t = team();
        Challenge teamC = challenge("Team Challenge");
        Challenge globalC = challenge("Global Challenge");

        Assignment teamAssign = teamAssignment(b, teamC, t, Instant.now());
        Assignment globalAssign = globalAssignment(b, globalC, Instant.now().minusSeconds(1));

        List<Assignment> sorted = List.of(teamAssign, globalAssign);

        Challenge result = AssignmentResolver.resolve(b, t.getId(), sorted);

        assertEquals(teamC.getId(), result.getId(),
                "Team-specific assignment must take priority over global assignment");
    }

    @Test
    void returnsGlobalChallenge_whenOnlyGlobalAssignmentExists() {
        Base b = base();
        Team t = team();
        Challenge globalC = challenge("Global Challenge");

        Assignment globalAssign = globalAssignment(b, globalC, Instant.now());

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of(globalAssign));

        assertEquals(globalC.getId(), result.getId(),
                "Global assignment must be used when no team-specific assignment exists");
    }

    @Test
    void returnsFixedChallenge_whenNoAssignmentsExist() {
        Challenge fixed = challenge("Fixed Challenge");
        Base b = baseWithFixed(fixed);
        Team t = team();

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of());

        assertEquals(fixed.getId(), result.getId(),
                "Fixed challenge must be returned as last resort when no assignments exist");
    }

    @Test
    void returnsNull_whenNoAssignmentsAndNoFixedChallenge() {
        Base b = base(); // no fixedChallenge
        Team t = team();

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of());

        assertNull(result, "Null must be returned when there is no assignment and no fixed challenge");
    }

    // ── resolve() — priority ordering ───────────────────────────────

    @Test
    void teamAssignmentWins_overGlobalAndFixed() {
        Challenge fixed = challenge("Fixed");
        Base b = baseWithFixed(fixed);
        Team t = team();
        Challenge teamC = challenge("Team");
        Challenge globalC = challenge("Global");

        Assignment teamAssign = teamAssignment(b, teamC, t, Instant.now());
        Assignment globalAssign = globalAssignment(b, globalC, Instant.now().minusSeconds(1));

        List<Assignment> sorted = List.of(teamAssign, globalAssign);

        Challenge result = AssignmentResolver.resolve(b, t.getId(), sorted);

        assertEquals(teamC.getId(), result.getId());
    }

    @Test
    void globalAssignmentWins_overFixed() {
        Challenge fixed = challenge("Fixed");
        Base b = baseWithFixed(fixed);
        Team t = team();
        Challenge globalC = challenge("Global");

        Assignment globalAssign = globalAssignment(b, globalC, Instant.now());

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of(globalAssign));

        assertEquals(globalC.getId(), result.getId());
    }

    // ── resolve() — base scoping ─────────────────────────────────────

    @Test
    void ignoresAssignmentsForDifferentBase() {
        Base b = base();
        Base otherBase = base();
        Team t = team();
        Challenge otherC = challenge("Other Base Challenge");
        Challenge fixedC = challenge("Fixed");
        b.setFixedChallenge(fixedC);

        // Assignment is for otherBase, not b
        Assignment otherAssign = teamAssignment(otherBase, otherC, t, Instant.now());

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of(otherAssign));

        // Falls through to fixedChallenge because the only assignment is for the wrong base
        assertEquals(fixedC.getId(), result.getId(),
                "Assignments for a different base must be ignored");
    }

    @Test
    void ignoresTeamAssignmentForDifferentTeam() {
        Base b = base();
        Team t = team();
        Team otherTeam = team();
        Challenge otherTeamC = challenge("Other Team Challenge");
        Challenge globalC = challenge("Global");

        Assignment otherTeamAssign = teamAssignment(b, otherTeamC, otherTeam, Instant.now());
        Assignment globalAssign = globalAssignment(b, globalC, Instant.now().minusSeconds(1));

        List<Assignment> sorted = List.of(otherTeamAssign, globalAssign);

        Challenge result = AssignmentResolver.resolve(b, t.getId(), sorted);

        assertEquals(globalC.getId(), result.getId(),
                "Team-specific assignment for a different team must be ignored");
    }

    // ── resolve() — recency tie-breaking ────────────────────────────

    @Test
    void mostRecentTeamAssignment_selectedWhenMultipleExist() {
        Base b = base();
        Team t = team();
        Challenge older = challenge("Older");
        Challenge newer = challenge("Newer");

        Instant now = Instant.now();
        Assignment olderAssign = teamAssignment(b, older, t, now.minusSeconds(60));
        Assignment newerAssign = teamAssignment(b, newer, t, now);

        // Sort descending by createdAt as RECENCY_COMPARATOR specifies
        List<Assignment> sorted = List.of(olderAssign, newerAssign)
                .stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR)
                .toList();

        Challenge result = AssignmentResolver.resolve(b, t.getId(), sorted);

        assertEquals(newer.getId(), result.getId(),
                "The most recent team assignment must win when multiple exist for the same team/base");
    }

    @Test
    void mostRecentGlobalAssignment_selectedWhenMultipleExist() {
        Base b = base();
        Team t = team();
        Challenge older = challenge("Older");
        Challenge newer = challenge("Newer");

        Instant now = Instant.now();
        Assignment olderAssign = globalAssignment(b, older, now.minusSeconds(60));
        Assignment newerAssign = globalAssignment(b, newer, now);

        List<Assignment> sorted = List.of(olderAssign, newerAssign)
                .stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR)
                .toList();

        Challenge result = AssignmentResolver.resolve(b, t.getId(), sorted);

        assertEquals(newer.getId(), result.getId(),
                "The most recent global assignment must win when multiple exist for the same base");
    }

    // ── RECENCY_COMPARATOR ───────────────────────────────────────────

    @Test
    void recencyComparator_placesNullCreatedAtLast() {
        Base b = base();
        Team t = team();
        Challenge withDate = challenge("With Date");
        Challenge withoutDate = challenge("Without Date");

        Assignment withDateAssign = teamAssignment(b, withDate, t, Instant.now());
        Assignment withoutDateAssign = teamAssignment(b, withoutDate, t, null);

        List<Assignment> sorted = List.of(withoutDateAssign, withDateAssign)
                .stream()
                .sorted(AssignmentResolver.RECENCY_COMPARATOR)
                .toList();

        assertEquals(withDate.getId(), sorted.get(0).getChallenge().getId(),
                "Assignment with a createdAt timestamp must come before null-dated ones");
    }

    @Test
    void recencyComparator_ordersNewerBeforeOlder() {
        Base b = base();
        Team t = team();
        Instant now = Instant.now();

        Assignment newer = teamAssignment(b, challenge("Newer"), t, now);
        Assignment older = teamAssignment(b, challenge("Older"), t, now.minusSeconds(100));

        Comparator<Assignment> comp = AssignmentResolver.RECENCY_COMPARATOR;
        assertTrue(comp.compare(newer, older) < 0,
                "RECENCY_COMPARATOR must order newer assignments before older ones");
    }

    @Test
    void recencyComparator_tiesOnCreatedAt_resolvedByIdDescending() {
        Base b = base();
        Team t = team();
        Instant sameTime = Instant.now();

        // Craft UUIDs with predictable string ordering for the tiebreaker
        UUID higherId = UUID.fromString("ffffffff-0000-0000-0000-000000000000");
        UUID lowerId  = UUID.fromString("00000000-0000-0000-0000-000000000000");

        Assignment high = Assignment.builder()
                .id(higherId).base(b).challenge(challenge("High")).team(t).build();
        high.setCreatedAt(sameTime);

        Assignment low = Assignment.builder()
                .id(lowerId).base(b).challenge(challenge("Low")).team(t).build();
        low.setCreatedAt(sameTime);

        Comparator<Assignment> comp = AssignmentResolver.RECENCY_COMPARATOR;
        assertTrue(comp.compare(high, low) < 0,
                "When createdAt is equal the higher UUID string must sort first (descending id tiebreaker)");
    }

    // ── resolve() — empty sorted list with no fixed challenge ────────

    @Test
    void returnsNull_whenAssignmentListIsEmpty_andNoFixedChallenge() {
        Base b = base();
        Team t = team();

        assertNull(AssignmentResolver.resolve(b, t.getId(), List.of()));
    }

    // ── resolve() — assignments for other bases are irrelevant ───────

    @Test
    void returnsFixed_whenAllAssignmentsAreForOtherBases() {
        Base b = base();
        Base otherBase = base();
        Team t = team();
        Challenge fixed = challenge("Fixed");
        b.setFixedChallenge(fixed);

        Assignment otherGlobal = globalAssignment(otherBase, challenge("Other Global"), Instant.now());
        Assignment otherTeam   = teamAssignment(otherBase, challenge("Other Team"), t, Instant.now());

        Challenge result = AssignmentResolver.resolve(b, t.getId(), List.of(otherGlobal, otherTeam));

        assertEquals(fixed.getId(), result.getId(),
                "Must fall back to fixed challenge when all list entries target other bases");
    }
}
