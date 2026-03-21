package com.prayer.pointfinder.service;

import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

/**
 * Unit tests for ChallengeAssignmentService.autoAssignChallenges().
 *
 * Covers:
 * - Early-exit when no teams or no challenges exist
 * - Fixed-challenge bases produce per-team assignments
 * - Fixed-challenge bases are skipped when assignments already exist
 * - Fixed challenges are excluded from the random pool
 * - Location-bound challenges are excluded from the random pool
 * - Uniform-assignment mode: all teams get the same challenge per base
 * - Per-team mode: each team gets a unique challenge per base
 * - Bases that already have assignments are skipped
 * - Pool exhaustion in uniform mode logs a warning and skips the base
 * - Pool exhaustion in per-team mode logs a warning and skips the team
 * - saveAll is called once (batch) when assignments are produced
 * - saveAll is never called when nothing needs to be created
 */
@ExtendWith(MockitoExtension.class)
class ChallengeAssignmentServiceTest {

    @Mock
    private BaseRepository baseRepository;
    @Mock
    private ChallengeRepository challengeRepository;
    @Mock
    private TeamRepository teamRepository;
    @Mock
    private AssignmentRepository assignmentRepository;

    private ChallengeAssignmentService service;

    // Reusable game fixture
    private Game game;
    private UUID gameId;

    @BeforeEach
    void setUp() {
        service = new ChallengeAssignmentService(
                baseRepository, challengeRepository, teamRepository, assignmentRepository);

        gameId = UUID.randomUUID();
        game = Game.builder()
                .id(gameId)
                .name("Test Game")
                .description("desc")
                .status(GameStatus.setup)
                .uniformAssignment(false)
                .build();
    }

    // ── Helper builders ──────────────────────────────────────────────

    private Base base(String name) {
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name(name)
                .description("")
                .lat(47.0).lng(8.0)
                .nfcLinked(true)
                .build();
    }

    private Base baseWithFixedChallenge(String name, Challenge fixed) {
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name(name)
                .description("")
                .lat(47.0).lng(8.0)
                .nfcLinked(true)
                .fixedChallenge(fixed)
                .build();
    }

    private Challenge challenge(String title) {
        return Challenge.builder()
                .id(UUID.randomUUID())
                .game(game)
                .title(title)
                .description("")
                .content("")
                .completionContent("")
                .answerType(AnswerType.text)
                .autoValidate(false)
                .points(10)
                .locationBound(false)
                .build();
    }

    private Challenge locationBoundChallenge(String title) {
        Challenge c = challenge(title);
        c.setLocationBound(true);
        return c;
    }

    private Team team(String name) {
        return Team.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name(name)
                .joinCode(name.substring(0, Math.min(name.length(), 6)).toUpperCase())
                .color("#FF0000")
                .build();
    }

    private Assignment existingAssignment(Base b, Challenge c, Team t) {
        return Assignment.builder()
                .id(UUID.randomUUID())
                .game(game)
                .base(b)
                .challenge(c)
                .team(t)
                .build();
    }

    // ── Early-exit tests ─────────────────────────────────────────────

    @Test
    void doesNothing_whenNoTeamsExist() {
        Base b = base("Base A");
        Challenge c = challenge("C1");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of());
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        verify(assignmentRepository, never()).saveAll(anyList());
    }

    @Test
    void doesNothing_whenNoChallengesExist() {
        Base b = base("Base A");
        Team t = team("TeamA");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of());
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        verify(assignmentRepository, never()).saveAll(anyList());
    }

    // ── Fixed-challenge base tests ────────────────────────────────────

    @Test
    void fixedChallengeBase_createsOneAssignmentPerTeam() {
        Challenge fixed = challenge("Fixed C");
        Base b = baseWithFixedChallenge("Base Fixed", fixed);
        Team t1 = team("Team1");
        Team t2 = team("Team2");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t1, t2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(2, saved.size());
        assertTrue(saved.stream().allMatch(a -> a.getChallenge().getId().equals(fixed.getId())));
        assertTrue(saved.stream().allMatch(a -> a.getBase().getId().equals(b.getId())));
    }

    @Test
    void fixedChallengeBase_assignmentUsesCorrectTeamReferences() {
        Challenge fixed = challenge("Fixed C");
        Base b = baseWithFixedChallenge("Base Fixed", fixed);
        Team t = team("OnlyTeam");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        Assignment saved = captor.getValue().get(0);
        assertEquals(t.getId(), saved.getTeam().getId());
        assertEquals(game.getId(), saved.getGame().getId());
    }

    @Test
    void fixedChallengeBase_skippedWhenBaseAlreadyHasAssignments() {
        Challenge fixed = challenge("Fixed C");
        Base b = baseWithFixedChallenge("Base Fixed", fixed);
        Team t = team("Team1");
        // Pre-existing assignment for that base
        Assignment existing = existingAssignment(b, fixed, t);

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(existing));

        service.autoAssignChallenges(game);

        verify(assignmentRepository, never()).saveAll(anyList());
    }

    // ── Pool exclusion tests ─────────────────────────────────────────

    @Test
    void locationBoundChallenge_excludedFromRandomPool_inPerTeamMode() {
        Base b = base("Base A");
        Team t = team("Team1");
        Challenge locationBound = locationBoundChallenge("Location C");
        // Only challenge is location-bound → pool empty → no assignments
        Challenge regularC = challenge("Regular C");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(locationBound, regularC));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        // The location-bound challenge must never appear in auto-assigned random slots
        assertTrue(saved.stream().noneMatch(a -> a.getChallenge().getId().equals(locationBound.getId())));
        assertEquals(1, saved.size());
        assertEquals(regularC.getId(), saved.get(0).getChallenge().getId());
    }

    @Test
    void fixedChallenge_excludedFromRandomPool_inPerTeamMode() {
        Challenge fixed = challenge("Fixed C");
        Challenge poolC = challenge("Pool C");

        Base fixedBase = baseWithFixedChallenge("Fixed Base", fixed);
        Base freeBase = base("Free Base");
        Team t = team("Team1");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(fixedBase, freeBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed, poolC));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        // The free base must receive the pool challenge, not the fixed one
        Assignment freeBaseAssignment = saved.stream()
                .filter(a -> a.getBase().getId().equals(freeBase.getId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("No assignment for free base"));
        assertEquals(poolC.getId(), freeBaseAssignment.getChallenge().getId());
    }

    // ── Per-team mode (uniformAssignment = false) ────────────────────

    @Test
    void perTeamMode_eachTeamGetsAssignmentFromRandomPool_atSameBase() {
        game.setUniformAssignment(false);

        Base b = base("Base A");
        Team t1 = team("Team1");
        Team t2 = team("Team2");
        Challenge c1 = challenge("Challenge 1");
        Challenge c2 = challenge("Challenge 2");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t1, t2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(2, saved.size());

        Set<UUID> poolIds = Set.of(c1.getId(), c2.getId());

        // Each team gets exactly one assignment drawn from the random pool
        for (Assignment a : saved) {
            assertNotNull(a.getTeam(), "Per-team assignments must have a team set");
            assertTrue(poolIds.contains(a.getChallenge().getId()),
                    "Challenge should come from the random pool");
        }
        assertEquals(
                Set.of(t1.getId(), t2.getId()),
                saved.stream().map(a -> a.getTeam().getId()).collect(Collectors.toSet()),
                "Both teams should have exactly one assignment");
    }

    @Test
    void perTeamMode_sameTeamDoesNotGetSameChallengeAtTwoBases() {
        game.setUniformAssignment(false);

        Base b1 = base("Base 1");
        Base b2 = base("Base 2");
        Team t = team("OnlyTeam");
        Challenge c1 = challenge("Challenge 1");
        Challenge c2 = challenge("Challenge 2");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b1, b2));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(2, saved.size());

        UUID challengeAtBase1 = saved.stream()
                .filter(a -> a.getBase().getId().equals(b1.getId()))
                .findFirst().orElseThrow().getChallenge().getId();
        UUID challengeAtBase2 = saved.stream()
                .filter(a -> a.getBase().getId().equals(b2.getId()))
                .findFirst().orElseThrow().getChallenge().getId();

        assertNotEquals(challengeAtBase1, challengeAtBase2,
                "The same team must not receive the same challenge at two different bases");
    }

    @Test
    void perTeamMode_allAssignmentsHaveTeamSet() {
        game.setUniformAssignment(false);

        Base b = base("Base A");
        Team t1 = team("T1");
        Team t2 = team("T2");
        Challenge c1 = challenge("C1");
        Challenge c2 = challenge("C2");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t1, t2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        captor.getValue().forEach(a ->
                assertNotNull(a.getTeam(), "Per-team assignments must have team set"));
    }

    @Test
    void perTeamMode_poolExhaustion_skipsTeamAndDoesNotThrow() {
        game.setUniformAssignment(false);

        Base b1 = base("Base 1");
        Base b2 = base("Base 2");
        Team t = team("OnlyTeam");
        // Only one challenge for two bases — second base has empty pool for this team
        Challenge c1 = challenge("Only Challenge");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b1, b2));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        assertDoesNotThrow(() -> service.autoAssignChallenges(game));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        // Only 1 assignment created — the second base was skipped
        assertEquals(1, captor.getValue().size());
    }

    // ── Uniform-assignment mode ──────────────────────────────────────

    @Test
    void uniformMode_allTeamsGetSameChallenge_atEachBase() {
        game.setUniformAssignment(true);

        Base b = base("Base A");
        Team t1 = team("Team1");
        Team t2 = team("Team2");
        Challenge c = challenge("Shared C");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t1, t2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(2, saved.size());
        // Both teams get the exact same challenge
        assertEquals(1,
                saved.stream().map(a -> a.getChallenge().getId()).distinct().count(),
                "Uniform mode: all teams at a base must get the same challenge");
    }

    @Test
    void uniformMode_differentChallengesUsedAcrossBases() {
        game.setUniformAssignment(true);

        Base b1 = base("Base 1");
        Base b2 = base("Base 2");
        Team t = team("Team1");
        Challenge c1 = challenge("Challenge 1");
        Challenge c2 = challenge("Challenge 2");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b1, b2));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(2, saved.size());
        // One challenge per base, must be different
        UUID challengeAtBase1 = saved.stream()
                .filter(a -> a.getBase().getId().equals(b1.getId()))
                .findFirst().orElseThrow().getChallenge().getId();
        UUID challengeAtBase2 = saved.stream()
                .filter(a -> a.getBase().getId().equals(b2.getId()))
                .findFirst().orElseThrow().getChallenge().getId();
        assertNotEquals(challengeAtBase1, challengeAtBase2,
                "Uniform mode: different bases must receive different challenges from the shared pool");
    }

    @Test
    void uniformMode_poolExhaustion_skipsBaseAndDoesNotThrow() {
        game.setUniformAssignment(true);

        Base b1 = base("Base 1");
        Base b2 = base("Base 2");
        Team t = team("Team1");
        // Only one challenge for two bases — second base gets nothing
        Challenge c = challenge("Only Challenge");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b1, b2));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        assertDoesNotThrow(() -> service.autoAssignChallenges(game));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        // Only 1 assignment: the second base was skipped due to empty pool
        assertEquals(1, captor.getValue().size());
    }

    @Test
    void uniformMode_fixedChallengeExcludedFromSharedPool() {
        game.setUniformAssignment(true);

        Challenge fixed = challenge("Fixed C");
        Challenge poolC = challenge("Pool C");
        Base fixedBase = baseWithFixedChallenge("Fixed Base", fixed);
        Base freeBase = base("Free Base");
        Team t = team("Team1");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(fixedBase, freeBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed, poolC));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        // Free base must use poolC, not fixed
        Assignment freeAssignment = saved.stream()
                .filter(a -> a.getBase().getId().equals(freeBase.getId()))
                .findFirst().orElseThrow();
        assertEquals(poolC.getId(), freeAssignment.getChallenge().getId());
    }

    // ── Idempotency / skip-if-already-assigned ───────────────────────

    @Test
    void basesWithExistingAssignments_areSkipped() {
        game.setUniformAssignment(false);

        Base assignedBase = base("Already Assigned Base");
        Base newBase = base("New Base");
        Team t = team("Team1");
        Challenge c1 = challenge("C1");
        Challenge c2 = challenge("C2");

        Assignment existing = existingAssignment(assignedBase, c1, t);

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(assignedBase, newBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(existing));

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        // Only the new base gets an assignment
        assertEquals(1, saved.size());
        assertEquals(newBase.getId(), saved.get(0).getBase().getId());
    }

    @Test
    void existingAssignmentChallenge_excludedFromTeamPool_inPerTeamMode() {
        game.setUniformAssignment(false);

        Base existingBase = base("Existing Base");
        Base newBase = base("New Base");
        Team t = team("Team1");
        Challenge c1 = challenge("C1");
        Challenge c2 = challenge("C2");

        // Team already has c1 at existingBase
        Assignment existing = existingAssignment(existingBase, c1, t);

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(existingBase, newBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(existing));

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(1, saved.size());
        // The new base must get c2, since c1 was already used by this team
        assertEquals(c2.getId(), saved.get(0).getChallenge().getId());
    }

    @Test
    void existingGlobalAssignment_excludedFromTeamPool_inPerTeamMode() {
        // A global (team=null) existing assignment also blocks the challenge for all teams
        game.setUniformAssignment(false);

        Base existingBase = base("Existing Base");
        Base newBase = base("New Base");
        Team t = team("Team1");
        Challenge c1 = challenge("C1");
        Challenge c2 = challenge("C2");

        // Global assignment (team=null) for c1 at existingBase
        Assignment existing = Assignment.builder()
                .id(UUID.randomUUID())
                .game(game)
                .base(existingBase)
                .challenge(c1)
                .team(null)
                .build();

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(existingBase, newBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(existing));

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        assertEquals(1, saved.size());
        // c1 is blocked for the team because of the global assignment; c2 must be selected
        assertEquals(c2.getId(), saved.get(0).getChallenge().getId());
    }

    // ── saveAll batching ─────────────────────────────────────────────

    @Test
    void saveAllCalledExactlyOnce_whenAssignmentsAreCreated() {
        Base b = base("Base");
        Team t = team("Team");
        Challenge c = challenge("C");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        verify(assignmentRepository, times(1)).saveAll(anyList());
    }

    @Test
    void saveAllNeverCalled_whenAllBasesAlreadyAssigned() {
        Base b = base("Base");
        Team t = team("Team");
        Challenge c = challenge("C");
        Assignment existing = existingAssignment(b, c, t);

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of(existing));

        service.autoAssignChallenges(game);

        verify(assignmentRepository, never()).saveAll(anyList());
    }

    // ── Mixed scenario: fixed + random bases, multiple teams ─────────

    @Test
    void mixedBases_fixedAndRandom_perTeamMode_createsCorrectAssignments() {
        game.setUniformAssignment(false);

        Challenge fixed = challenge("Fixed C");
        Challenge c1 = challenge("Random C1");
        Challenge c2 = challenge("Random C2");

        Base fixedBase = baseWithFixedChallenge("Fixed Base", fixed);
        Base randomBase = base("Random Base");
        Team t1 = team("Alpha");
        Team t2 = team("Beta");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(fixedBase, randomBase));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t1, t2));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(fixed, c1, c2));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        List<Assignment> saved = captor.getValue();
        // fixedBase: 2 teams × fixed challenge = 2 assignments
        // randomBase: 2 teams × different challenges = 2 assignments
        assertEquals(4, saved.size());

        // All fixedBase assignments use the fixed challenge
        saved.stream()
                .filter(a -> a.getBase().getId().equals(fixedBase.getId()))
                .forEach(a -> assertEquals(fixed.getId(), a.getChallenge().getId()));

        // randomBase assignments must not use the fixed challenge
        saved.stream()
                .filter(a -> a.getBase().getId().equals(randomBase.getId()))
                .forEach(a -> assertNotEquals(fixed.getId(), a.getChallenge().getId()));

        // randomBase: both teams got an assignment
        long randomBaseAssignments = saved.stream()
                .filter(a -> a.getBase().getId().equals(randomBase.getId()))
                .count();
        assertEquals(2, randomBaseAssignments,
                "Per-team mode: both teams at the random base should receive an assignment");
    }

    @Test
    void gameEntityIsSetOnAllCreatedAssignments() {
        Base b = base("Base");
        Team t = team("Team");
        Challenge c = challenge("C");

        when(baseRepository.findByGameId(gameId)).thenReturn(List.of(b));
        when(teamRepository.findByGameId(gameId)).thenReturn(List.of(t));
        when(challengeRepository.findByGameId(gameId)).thenReturn(List.of(c));
        when(assignmentRepository.findByGameId(gameId)).thenReturn(List.of());

        service.autoAssignChallenges(game);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Assignment>> captor = ArgumentCaptor.forClass(List.class);
        verify(assignmentRepository).saveAll(captor.capture());

        captor.getValue().forEach(a ->
                assertEquals(game.getId(), a.getGame().getId(),
                        "Every created assignment must reference the game"));
    }
}
