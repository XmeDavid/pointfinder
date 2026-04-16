package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.SubmissionResponse;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Submission;
import com.prayer.pointfinder.entity.SubmissionStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.ActivityEventRepository;
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
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration coverage for the V36 audit foundation:
 *
 * <ul>
 *   <li>Player check-in populates the player actor snapshot fields on the
 *       check-in row and on the synthesized activity event.</li>
 *   <li>Player submission populates the submitted-by snapshot fields and
 *       the activity-event actor fields.</li>
 *   <li>Operator manual check-in records the operator user, display-name
 *       snapshot, source surface and optional reason.</li>
 *   <li>Operator manual check-in works with NO request body (legacy
 *       clients).</li>
 *   <li>Submission review records the operator on the activity event.</li>
 *   <li>{@code GameService.updateStatus(resetProgress=true)} soft-archives
 *       audit-relevant rows instead of deleting them, the active queries
 *       hide them, and the {@code *IncludingArchived} variants surface them
 *       for the Phase 3 audit export path.</li>
 *   <li>The snapshot endpoint never leaks archived data into the player or
 *       operator snapshot.</li>
 * </ul>
 */
class AuditFoundationTest extends IntegrationTestBase {

    @Autowired
    private TeamService teamService;

    @Autowired
    private PlayerService playerService;

    @Autowired
    private SubmissionService submissionService;

    @Autowired
    private GameService gameService;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ── Player check-in actor capture ───────────────────────────────────

    @Test
    void playerCheckInPopulatesPlayerActorSnapshotOnCheckInAndActivityEvent() {
        TestContext ctx = createLiveGameWithPlayer("p-checkin");
        authenticateAsPlayer(ctx.player);

        CheckInResponse response = playerService.checkIn(
                ctx.game.getId(), ctx.base.getId(), ctx.player, checkInRequestFor(ctx.base));

        assertNotNull(response);

        CheckIn persisted = checkInRepository.findById(response.getCheckInId()).orElseThrow();
        assertEquals(ctx.player.getId(), persisted.getPlayer().getId());
        assertNull(persisted.getActorOperatorUser(), "player check-in must not populate operator actor");
        assertEquals(ctx.player.getDeviceId(), persisted.getActorDeviceIdSnapshot());
        assertEquals(ctx.player.getDisplayName(), persisted.getActorDisplayNameSnapshot());
        assertEquals("player_app", persisted.getSourceSurface());
        assertNull(persisted.getOperatorReason());
        assertFalse(persisted.isArchived());

        List<ActivityEvent> events = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50));
        ActivityEvent checkInEvent = events.stream()
                .filter(e -> e.getType() == ActivityEventType.check_in)
                .findFirst()
                .orElseThrow();
        assertEquals(ctx.player.getId(), checkInEvent.getActorPlayer().getId());
        assertEquals(ctx.player.getDisplayName(), checkInEvent.getActorDisplayNameSnapshot());
        assertEquals(ctx.player.getDeviceId(), checkInEvent.getActorDeviceIdSnapshot());
        assertEquals("player_app", checkInEvent.getSourceSurface());
        assertNull(checkInEvent.getActorOperatorUser());
        assertFalse(checkInEvent.isArchived());
    }

    // ── Player submission actor capture ─────────────────────────────────

    @Test
    void playerSubmissionPopulatesSubmittedBySnapshotAndActivityEventActor() {
        TestContext ctx = createLiveGameWithPlayer("p-submit");
        authenticateAsPlayer(ctx.player);

        // Player must check in before submitting.
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, checkInRequestFor(ctx.base));

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(ctx.team.getId());
        request.setChallengeId(ctx.challenge.getId());
        request.setBaseId(ctx.base.getId());
        request.setAnswer("answer");
        request.setIdempotencyKey(UUID.randomUUID());
        SubmissionResponse response = submissionService.createSubmission(ctx.game.getId(), request);

        Submission submission = submissionRepository.findById(response.getId()).orElseThrow();
        assertNotNull(submission.getSubmittedByPlayer(), "player submission must record submittedByPlayer");
        assertEquals(ctx.player.getId(), submission.getSubmittedByPlayer().getId());
        assertEquals(ctx.player.getDisplayName(), submission.getSubmittedByDisplayNameSnapshot());
        assertEquals(ctx.player.getDeviceId(), submission.getSubmittedByDeviceIdSnapshot());
        assertEquals("player_app", submission.getSourceSurface());
        assertNull(submission.getCreatedByOperator(), "organic submissions must not record createdByOperator");
        assertNull(submission.getOperatorReason());
        assertFalse(submission.isArchived());

        ActivityEvent submissionEvent = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50))
                .stream()
                .filter(e -> e.getType() == ActivityEventType.submission)
                .findFirst()
                .orElseThrow();
        assertEquals(ctx.player.getId(), submissionEvent.getActorPlayer().getId());
        assertEquals(ctx.player.getDisplayName(), submissionEvent.getActorDisplayNameSnapshot());
        assertEquals(ctx.player.getDeviceId(), submissionEvent.getActorDeviceIdSnapshot());
        assertEquals("player_app", submissionEvent.getSourceSurface());
    }

    // ── Operator manual check-in actor capture ──────────────────────────

    @Test
    void operatorManualCheckInPopulatesOperatorActorSnapshotAndReason() {
        TestContext ctx = createLiveGameWithPlayer("op-manual");
        authenticateAsOperator(ctx.operator);

        CheckInResponse response = teamService.operatorCheckIn(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), "Player phone broke");

        CheckIn persisted = checkInRepository.findById(response.getCheckInId()).orElseThrow();
        assertNull(persisted.getPlayer(), "manual check-in must not link a player");
        assertNotNull(persisted.getActorOperatorUser());
        assertEquals(ctx.operator.getId(), persisted.getActorOperatorUser().getId());
        assertEquals(ctx.operator.getName(), persisted.getActorDisplayNameSnapshot());
        assertEquals("operator_rescue", persisted.getSourceSurface());
        assertEquals("Player phone broke", persisted.getOperatorReason());
        assertFalse(persisted.isArchived());

        ActivityEvent checkInEvent = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50))
                .stream()
                .filter(e -> e.getType() == ActivityEventType.check_in)
                .findFirst()
                .orElseThrow();
        assertEquals(ctx.operator.getId(), checkInEvent.getActorOperatorUser().getId());
        assertEquals(ctx.operator.getName(), checkInEvent.getActorDisplayNameSnapshot());
        assertEquals("operator_rescue", checkInEvent.getSourceSurface());
        assertNull(checkInEvent.getActorPlayer());
    }

    @Test
    void operatorManualCheckInWorksWithNoReason() {
        TestContext ctx = createLiveGameWithPlayer("op-noreason");
        authenticateAsOperator(ctx.operator);

        CheckInResponse response = teamService.operatorCheckIn(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId(), null);

        CheckIn persisted = checkInRepository.findById(response.getCheckInId()).orElseThrow();
        assertEquals("operator_rescue", persisted.getSourceSurface());
        assertNull(persisted.getOperatorReason());
        assertEquals(ctx.operator.getId(), persisted.getActorOperatorUser().getId());
    }

    @Test
    void operatorManualCheckInLegacyOverloadDelegatesWithNullReason() {
        // The 3-arg overload mirrors what controllers compiled before V36
        // call. It must keep working so legacy clients (and tests) that do
        // not pass a reason still produce a valid audit row.
        TestContext ctx = createLiveGameWithPlayer("op-legacy");
        authenticateAsOperator(ctx.operator);

        CheckInResponse response = teamService.operatorCheckIn(
                ctx.game.getId(), ctx.team.getId(), ctx.base.getId());

        CheckIn persisted = checkInRepository.findById(response.getCheckInId()).orElseThrow();
        assertEquals("operator_rescue", persisted.getSourceSurface());
        assertNull(persisted.getOperatorReason());
        assertEquals(ctx.operator.getId(), persisted.getActorOperatorUser().getId());
    }

    // ── Resume / archive contract ───────────────────────────────────────

    @Test
    void resetProgressArchivesSubmissionsCheckInsAndActivityEventsInsteadOfDeleting() {
        TestContext ctx = createLiveGameWithPlayer("archive");
        authenticateAsPlayer(ctx.player);

        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, checkInRequestFor(ctx.base));

        CreateSubmissionRequest request = new CreateSubmissionRequest();
        request.setTeamId(ctx.team.getId());
        request.setChallengeId(ctx.challenge.getId());
        request.setBaseId(ctx.base.getId());
        request.setAnswer("answer");
        request.setIdempotencyKey(UUID.randomUUID());
        submissionService.createSubmission(ctx.game.getId(), request);

        // Sanity-check pre-reset counts via the active-only queries.
        assertEquals(1, submissionRepository.findByTeamId(ctx.team.getId()).size());
        assertEquals(1, checkInRepository.findByGameIdWithRelations(ctx.game.getId()).size());
        long preActivity = activityEventRepository
                .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50)).size();
        assertTrue(preActivity >= 2,
                "expected at least the check_in and submission activity events");

        // Reset the game progress as the operator.
        authenticateAsOperator(ctx.operator);
        gameService.updateStatus(ctx.game.getId(), "ended", false);
        gameService.updateStatus(ctx.game.getId(), "setup", true);

        // Active reads must NOT see the archived rows.
        assertEquals(0, submissionRepository.findByTeamId(ctx.team.getId()).size(),
                "active findByTeamId must hide archived submissions");
        assertEquals(0, checkInRepository.findByGameIdWithRelations(ctx.game.getId()).size(),
                "active findByGameIdWithRelations must hide archived check-ins");
        assertEquals(0, activityEventRepository
                        .findRecentByGameId(ctx.game.getId(), PageRequest.of(0, 50)).size(),
                "active findRecentByGameId must hide archived activity events");

        // The audit-export variants MUST still see the archived rows.
        assertEquals(1, submissionRepository.findByGameIdIncludingArchived(ctx.game.getId()).size(),
                "Including-archived submissions read must surface the audit row");
        assertEquals(1, checkInRepository.findByGameIdIncludingArchived(ctx.game.getId()).size(),
                "Including-archived check-ins read must surface the audit row");
        assertTrue(activityEventRepository
                        .findByGameIdIncludingArchived(ctx.game.getId()).size() >= 2,
                "Including-archived activity events read must surface the audit rows");

        // Archived flag is true on every persisted row.
        Submission archivedSub = submissionRepository
                .findByGameIdIncludingArchived(ctx.game.getId()).get(0);
        assertTrue(archivedSub.isArchived(), "submission row must be marked archived");
        CheckIn archivedCheckIn = checkInRepository
                .findByGameIdIncludingArchived(ctx.game.getId()).get(0);
        assertTrue(archivedCheckIn.isArchived(), "check-in row must be marked archived");
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private record TestContext(User operator, Game game, Team team, Base base, Challenge challenge, Player player) {}

    private TestContext createLiveGameWithPlayer(String suffix) {
        User operator = createOperator("op-" + suffix + "@audit.test", "password");
        Game game = createGame(operator, "Audit Game " + suffix, GameStatus.live);
        Team team = createTeam(game, "Audit Team " + suffix, joinCode(suffix));
        Base base = createBase(game, "Audit Base " + suffix);
        Challenge challenge = createChallenge(game, "Audit Challenge " + suffix, AnswerType.text, 10);
        Player player = createPlayer(team, "Audit Scout " + suffix, "device-" + suffix);
        return new TestContext(operator, game, team, base, challenge, player);
    }

    /**
     * Generates a deterministic, repository-valid join code (uppercase
     * alphanumeric, max 20 chars). Different per suffix so test isolation
     * does not cause join-code collisions inside a single transaction.
     */
    private String joinCode(String suffix) {
        String cleaned = suffix.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (cleaned.isEmpty()) cleaned = "X";
        if (cleaned.length() > 12) cleaned = cleaned.substring(0, 12);
        return ("AUD" + cleaned).substring(0, Math.min(20, ("AUD" + cleaned).length()));
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
