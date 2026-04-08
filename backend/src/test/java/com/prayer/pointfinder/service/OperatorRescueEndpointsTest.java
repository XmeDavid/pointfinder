package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.MarkCompletedRequest;
import com.prayer.pointfinder.dto.request.UnlockOverrideRequest;
import com.prayer.pointfinder.dto.response.BaseProgressResponse;
import com.prayer.pointfinder.dto.response.BaseUnlockOverrideResponse;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.BaseUnlockOverride;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserRole;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.exception.ResourceNotFoundException;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.BaseUnlockOverrideRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration coverage for the P1 Phase 2 operator rescue endpoints:
 *
 * <ul>
 *   <li>Mark-completed — synthesizes an approved submission, awards
 *       challenge points (or the operator override), captures the V36
 *       audit fields, is idempotent on
 *       {@code (operator, team, base, challenge)}, requires an active
 *       check-in, and rejects callers without game access.</li>
 *   <li>Unlock override — creates a reversible override, surfaces a
 *       hidden base to the target team (and only that team), soft-
 *       deletes on DELETE, allows resurrection, is idempotent on
 *       duplicate create, and captures the V36 audit fields.</li>
 * </ul>
 *
 * <p>All tests use the shared {@link IntegrationTestBase} postgres
 * testcontainer and drive the flows through the real services (not the
 * controllers) to keep the test surface tight on the business logic.
 */
class OperatorRescueEndpointsTest extends IntegrationTestBase {

    @Autowired
    private SubmissionService submissionService;

    @Autowired
    private PlayerService playerService;

    @Autowired
    private TeamService teamService;

    @Autowired
    private BaseUnlockOverrideService baseUnlockOverrideService;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @Autowired
    private BaseUnlockOverrideRepository baseUnlockOverrideRepository;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ==================================================================
    //  Mark-completed
    // ==================================================================

    @Test
    void markCompletedHappyPathCreatesApprovedSubmissionWithAuditFields() {
        TestContext ctx = createLiveGameWithPlayer("mc-happy");
        // Team must be checked in first.
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());

        SubmissionResponse response = submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request);

        assertNotNull(response);
        Submission saved = submissionRepository.findById(response.getId()).orElseThrow();
        assertEquals(SubmissionStatus.approved, saved.getStatus());
        assertEquals(ctx.challenge.getPoints(), saved.getPoints(),
                "default points must equal challenge.points");
        assertNotNull(saved.getIdempotencyKey());
        assertEquals(ctx.operator.getId(), saved.getCreatedByOperator().getId());
        assertEquals(ctx.operator.getName(), saved.getCreatedByDisplayNameSnapshot());
        assertEquals("operator_rescue", saved.getSourceSurface());
        assertNull(saved.getOperatorReason(),
                "no reason supplied, operator_reason must be NULL");
        assertEquals(ctx.operator.getId(), saved.getReviewedBy().getId(),
                "mark-completed sets reviewed_by to the acting operator");
        assertNotNull(saved.getReviewedBy());
        assertFalse(saved.isArchived());
        assertEquals("[Operator marked complete]", saved.getAnswer());

        ActivityEvent event = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50))
                .stream()
                .filter(e -> e.getType() == ActivityEventType.operator_override)
                .findFirst()
                .orElseThrow();
        assertEquals(ctx.operator.getId(), event.getActorOperatorUser().getId());
        assertEquals(ctx.operator.getName(), event.getActorDisplayNameSnapshot());
        assertEquals("operator_rescue", event.getSourceSurface());
        assertEquals(ctx.team.getId(), event.getTeam().getId());
        assertEquals(ctx.base.getId(), event.getBase().getId());
        assertEquals(ctx.challenge.getId(), event.getChallenge().getId());
    }

    @Test
    void markCompletedIsIdempotentOnSameOperatorTeamBaseChallenge() {
        TestContext ctx = createLiveGameWithPlayer("mc-idem");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());

        SubmissionResponse first = submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request);
        SubmissionResponse second = submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request);

        assertEquals(first.getId(), second.getId(),
                "re-call for the same (operator, team, base, challenge) must return the same row");

        long count = submissionRepository.findByTeamId(ctx.team.getId()).stream()
                .filter(s -> s.getChallenge().getId().equals(ctx.challenge.getId()))
                .count();
        assertEquals(1, count, "only one submission should exist after idempotent re-call");
    }

    @Test
    void markCompletedWithPointsOverrideUsesSuppliedValue() {
        TestContext ctx = createLiveGameWithPlayer("mc-points");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());
        request.setPointsOverride(50);
        request.setReason("Partial credit — video was incomplete but effort was clear");

        SubmissionResponse response = submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request);

        Submission saved = submissionRepository.findById(response.getId()).orElseThrow();
        assertEquals(50, saved.getPoints(),
                "pointsOverride must win over challenge.points");
        assertEquals("Partial credit — video was incomplete but effort was clear",
                saved.getOperatorReason());
    }

    @Test
    void markCompletedWithoutCheckInIsRejected() {
        TestContext ctx = createLiveGameWithPlayer("mc-nocheckin");
        authenticateAsOperator(ctx.operator);

        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> submissionService.markCompletedByOperator(
                        ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request));
        assertEquals(ErrorCode.MARK_COMPLETED_REQUIRES_CHECKIN, ex.getErrorCode(),
                "error must carry the MARK_COMPLETED_REQUIRES_CHECKIN error code");
    }

    @Test
    void markCompletedWithUnknownChallengeReturnsNotFound() {
        TestContext ctx = createLiveGameWithPlayer("mc-unknown");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(UUID.randomUUID()); // unknown id

        assertThrows(ResourceNotFoundException.class,
                () -> submissionService.markCompletedByOperator(
                        ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request));
    }

    @Test
    void markCompletedByUnauthorizedOperatorIsForbidden() {
        TestContext ctx = createLiveGameWithPlayer("mc-forbid");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        // Create a second operator with NO access to the game.
        User outsider = createOperator("outsider-mc@rescue.test", "password");
        authenticateAsOperator(outsider);

        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());

        assertThrows(ForbiddenException.class,
                () -> submissionService.markCompletedByOperator(
                        ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request));
    }

    @Test
    void markCompletedReasonIsCapturedOnSubmissionRow() {
        TestContext ctx = createLiveGameWithPlayer("mc-reason");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest request = new MarkCompletedRequest();
        request.setChallengeId(ctx.challenge.getId());
        request.setReason("Team's phone died mid-upload");

        SubmissionResponse response = submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), request);
        Submission saved = submissionRepository.findById(response.getId()).orElseThrow();
        assertEquals("Team's phone died mid-upload", saved.getOperatorReason());
    }

    // ==================================================================
    //  Unlock override
    // ==================================================================

    @Test
    void unlockOverrideMakesHiddenBaseVisibleToTargetTeamOnly() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-visible");
        // A second team in the same game — it must NOT see the base.
        Team otherTeam = createTeam(ctx.game, "Other Team", joinCode("uouvo"));
        Player otherPlayer = createPlayer(otherTeam, "Scout Other", "device-uo-other");

        authenticateAsOperator(ctx.operator);
        UnlockOverrideRequest request = new UnlockOverrideRequest();
        request.setReason("GPS rain-out; letting them attempt the hidden base");

        BaseUnlockOverrideResponse response = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), request);
        assertNotNull(response);
        assertNotNull(response.getId());
        assertEquals(ctx.team.getId(), response.getTeamId());
        assertEquals(ctx.hiddenBase.getId(), response.getBaseId());
        assertEquals(ctx.operator.getId(), response.getCreatedByOperatorId());
        assertEquals(ctx.operator.getName(), response.getCreatedByDisplayName());
        assertEquals("GPS rain-out; letting them attempt the hidden base", response.getReason());

        // Target team sees the hidden base in its progress.
        authenticateAsPlayer(ctx.player);
        List<BaseProgressResponse> progress = playerService.getProgress(ctx.game.getId(), ctx.player);
        boolean visibleForTarget = progress.stream()
                .anyMatch(p -> p.getBaseId().equals(ctx.hiddenBase.getId()));
        assertTrue(visibleForTarget,
                "hidden base must be visible to the team that has the active override");

        // Other team does NOT see the hidden base.
        authenticateAsPlayer(otherPlayer);
        List<BaseProgressResponse> otherProgress = playerService.getProgress(ctx.game.getId(), otherPlayer);
        boolean visibleForOther = otherProgress.stream()
                .anyMatch(p -> p.getBaseId().equals(ctx.hiddenBase.getId()));
        assertFalse(visibleForOther,
                "override must NOT leak to other teams in the same game");
    }

    @Test
    void unlockOverrideSoftDeleteMakesBaseHiddenAgain() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-soft");

        authenticateAsOperator(ctx.operator);
        baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        // Verify base is visible before soft-delete.
        authenticateAsPlayer(ctx.player);
        assertTrue(playerService.getProgress(ctx.game.getId(), ctx.player).stream()
                .anyMatch(p -> p.getBaseId().equals(ctx.hiddenBase.getId())));

        // Remove override.
        authenticateAsOperator(ctx.operator);
        UnlockOverrideRequest removeReq = new UnlockOverrideRequest();
        removeReq.setReason("Rain stopped; game is back on schedule");
        baseUnlockOverrideService.removeOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), removeReq);

        // The row should be soft-deleted but still present.
        List<BaseUnlockOverride> active = baseUnlockOverrideRepository
                .findActiveByGameIdAndTeamId(ctx.game.getId(), ctx.team.getId());
        assertTrue(active.isEmpty(), "soft-delete must remove the row from active queries");

        // But the history row is still in the database.
        long totalRows = baseUnlockOverrideRepository.findAll().stream()
                .filter(o -> o.getTeam().getId().equals(ctx.team.getId())
                        && o.getBase().getId().equals(ctx.hiddenBase.getId()))
                .count();
        assertEquals(1, totalRows, "soft-delete must preserve the history row");

        BaseUnlockOverride historical = baseUnlockOverrideRepository.findAll().stream()
                .filter(o -> o.getTeam().getId().equals(ctx.team.getId())
                        && o.getBase().getId().equals(ctx.hiddenBase.getId()))
                .findFirst()
                .orElseThrow();
        assertNotNull(historical.getDeletedAt());
        assertNotNull(historical.getDeletedByOperator());
        assertEquals(ctx.operator.getId(), historical.getDeletedByOperator().getId());
        assertEquals(ctx.operator.getName(), historical.getDeletedByDisplayNameSnapshot());

        // Base must be hidden again for the player.
        authenticateAsPlayer(ctx.player);
        assertFalse(playerService.getProgress(ctx.game.getId(), ctx.player).stream()
                        .anyMatch(p -> p.getBaseId().equals(ctx.hiddenBase.getId())),
                "base must be hidden again after the override is removed");
    }

    @Test
    void unlockOverrideResurrectAfterDeleteCreatesNewRow() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-resur");
        authenticateAsOperator(ctx.operator);

        BaseUnlockOverrideResponse first = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        baseUnlockOverrideService.removeOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        BaseUnlockOverrideResponse second = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        assertNotEquals(first.getId(), second.getId(),
                "create after soft-delete must produce a NEW row, not revive the deleted one");

        // Total rows for this pair = 2 (the deleted history row + the fresh one).
        long totalRows = baseUnlockOverrideRepository.findAll().stream()
                .filter(o -> o.getTeam().getId().equals(ctx.team.getId())
                        && o.getBase().getId().equals(ctx.hiddenBase.getId()))
                .count();
        assertEquals(2, totalRows);
    }

    @Test
    void unlockOverrideDuplicateCreateReturnsExistingRowIdempotently() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-dup");
        authenticateAsOperator(ctx.operator);

        BaseUnlockOverrideResponse first = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);
        BaseUnlockOverrideResponse second = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        assertEquals(first.getId(), second.getId(),
                "duplicate create on the same active pair must return the existing row");

        long activeRows = baseUnlockOverrideRepository
                .findActiveByGameIdAndTeamId(ctx.game.getId(), ctx.team.getId()).size();
        assertEquals(1, activeRows, "only one active override row for the pair");
    }

    @Test
    void unlockOverrideActivityEventsAreEmittedOnCreateAndRemove() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-act");
        authenticateAsOperator(ctx.operator);

        baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);
        baseUnlockOverrideService.removeOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        List<ActivityEvent> overrideEvents = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50))
                .stream()
                .filter(e -> e.getType() == ActivityEventType.operator_override)
                .toList();
        assertEquals(2, overrideEvents.size(),
                "both create and remove must emit an operator_override activity event");
        for (ActivityEvent ev : overrideEvents) {
            assertEquals(ctx.operator.getId(), ev.getActorOperatorUser().getId());
            assertEquals(ctx.operator.getName(), ev.getActorDisplayNameSnapshot());
            assertEquals("operator_rescue", ev.getSourceSurface());
            assertEquals(ctx.team.getId(), ev.getTeam().getId());
            assertEquals(ctx.hiddenBase.getId(), ev.getBase().getId());
        }
    }

    @Test
    void unlockOverrideOperatorCaptureFieldsAreCorrect() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-cap");
        authenticateAsOperator(ctx.operator);

        BaseUnlockOverrideResponse response = baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);

        BaseUnlockOverride saved = baseUnlockOverrideRepository.findById(response.getId()).orElseThrow();
        assertEquals(ctx.operator.getId(), saved.getCreatedByOperator().getId());
        assertEquals(ctx.operator.getName(), saved.getCreatedByDisplayNameSnapshot());
        assertNotNull(saved.getCreatedAt());
        assertNull(saved.getDeletedAt());
        assertNull(saved.getDeletedByOperator());
    }

    @Test
    void unlockOverrideListActiveReturnsOnlyActiveForTeam() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-list");
        // Create a second hidden base so we can cover multiple rows.
        Base hiddenBase2 = baseRepository.save(Base.builder()
                .game(ctx.game)
                .name("Hidden 2")
                .description("Another hidden base")
                .lat(47.0)
                .lng(8.1)
                .nfcLinked(true)
                .hidden(true)
                .build());

        authenticateAsOperator(ctx.operator);
        baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null);
        baseUnlockOverrideService.createOverride(
                ctx.game.getId(), ctx.team.getId(), hiddenBase2.getId(), null);
        // Remove one.
        baseUnlockOverrideService.removeOverride(
                ctx.game.getId(), ctx.team.getId(), hiddenBase2.getId(), null);

        List<BaseUnlockOverrideResponse> listing = baseUnlockOverrideService
                .listActiveForTeam(ctx.game.getId(), ctx.team.getId());
        assertEquals(1, listing.size());
        assertEquals(ctx.hiddenBase.getId(), listing.get(0).getBaseId());
    }

    @Test
    void unlockOverrideByUnauthorizedOperatorIsForbidden() {
        TestContext ctx = createLiveGameWithHiddenBase("uo-forbid");
        User outsider = createOperator("outsider-uo@rescue.test", "password");
        authenticateAsOperator(outsider);

        assertThrows(ForbiddenException.class,
                () -> baseUnlockOverrideService.createOverride(
                        ctx.game.getId(), ctx.team.getId(), ctx.hiddenBase.getId(), null));
    }

    // ==================================================================
    //  helpers
    // ==================================================================

    private record TestContext(
            User operator,
            Game game,
            Team team,
            Base base,
            Base hiddenBase,
            Challenge challenge,
            Player player
    ) {}

    private TestContext createLiveGameWithPlayer(String suffix) {
        User operator = createOperator("op-" + suffix + "@rescue.test", "password");
        Game game = createGame(operator, "Rescue Game " + suffix, GameStatus.live);
        Team team = createTeam(game, "Rescue Team " + suffix, joinCode(suffix));
        Base base = createBase(game, "Rescue Base " + suffix);
        Challenge challenge = createChallenge(game, "Rescue Challenge " + suffix, AnswerType.text, 10);
        Player player = createPlayer(team, "Rescue Scout " + suffix, "device-" + suffix);
        return new TestContext(operator, game, team, base, null, challenge, player);
    }

    private TestContext createLiveGameWithHiddenBase(String suffix) {
        User operator = createOperator("op-" + suffix + "@rescue.test", "password");
        Game game = createGame(operator, "Rescue Game " + suffix, GameStatus.live);
        Team team = createTeam(game, "Rescue Team " + suffix, joinCode(suffix));
        Base visibleBase = createBase(game, "Visible Base " + suffix);
        // Second base, hidden.
        Base hidden = baseRepository.save(Base.builder()
                .game(game)
                .name("Hidden Base " + suffix)
                .description("Hidden by default")
                .lat(47.0)
                .lng(8.0)
                .nfcLinked(true)
                .hidden(true)
                .build());
        Challenge challenge = createChallenge(game, "Rescue Challenge " + suffix, AnswerType.text, 10);
        Player player = createPlayer(team, "Rescue Scout " + suffix, "device-" + suffix);
        return new TestContext(operator, game, team, visibleBase, hidden, challenge, player);
    }

    /**
     * Generates a deterministic, repository-valid join code (uppercase
     * alphanumeric, max 20 chars).
     */
    private String joinCode(String suffix) {
        String cleaned = suffix.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (cleaned.isEmpty()) cleaned = "X";
        if (cleaned.length() > 12) cleaned = cleaned.substring(0, 12);
        String code = "RES" + cleaned;
        return code.substring(0, Math.min(20, code.length()));
    }

    private void authenticateAsOperator(User operator) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, java.util.List.of()));
    }

    private void authenticateAsPlayer(Player player) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(player, null, java.util.List.of()));
    }
}
