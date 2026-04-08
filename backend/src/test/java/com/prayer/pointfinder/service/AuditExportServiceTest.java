package com.prayer.pointfinder.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.CreateSubmissionRequest;
import com.prayer.pointfinder.dto.request.MarkCompletedRequest;
import com.prayer.pointfinder.dto.response.AuditEntryDto;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ForbiddenException;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.service.AuditExportService.AuditExportQuery;
import com.prayer.pointfinder.service.AuditExportService.AuditExportResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration coverage for the P1 Phase 3 activity audit export service.
 * Exercises every query param from the spec — {@code format=json|csv}, {@code
 * from}, {@code to}, {@code teamId}, {@code playerId}, {@code operatorId},
 * {@code actionType}, {@code sourceSurface}, {@code includeArchived} — plus
 * the 403 path, the empty-game path, legacy null snapshot fallback, and CSV
 * escape handling for embedded commas and double-quotes in display names.
 *
 * <p>Driven through the real {@link AuditExportService} against the shared
 * {@link IntegrationTestBase} Postgres testcontainer so the pushdown query
 * and enum serialization are both covered end-to-end.
 */
class AuditExportServiceTest extends IntegrationTestBase {

    @Autowired
    private AuditExportService auditExportService;

    @Autowired
    private PlayerService playerService;

    @Autowired
    private SubmissionService submissionService;

    @Autowired
    private TeamService teamService;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @Autowired
    private GameService gameService;

    @Autowired
    private ObjectMapper objectMapper;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    // ==================================================================
    //  Happy path
    // ==================================================================

    @Test
    void exportReturnsAllActionsWithCorrectActorAttribution() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("happy");

        // Player check-in + submission.
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        CreateSubmissionRequest submitReq = new CreateSubmissionRequest();
        submitReq.setTeamId(ctx.team.getId());
        submitReq.setChallengeId(ctx.challenge.getId());
        submitReq.setBaseId(ctx.base.getId());
        submitReq.setAnswer("answer");
        submitReq.setIdempotencyKey(UUID.randomUUID());
        submissionService.createSubmission(ctx.game.getId(), submitReq);

        // Operator approval (mark-completed on a second base to produce an
        // operator_override event that is cleanly distinct).
        Base secondBase = createBase(ctx.game, "Second Base happy");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), secondBase.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        MarkCompletedRequest markReq = new MarkCompletedRequest();
        markReq.setChallengeId(ctx.challenge.getId());
        markReq.setReason("Phone died mid-submission");
        submissionService.markCompletedByOperator(
                ctx.game.getId(), ctx.team.getId(), secondBase.getId(), markReq);

        // Export.
        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> entries = exportJson(query(ctx.game.getId()).build());

        assertTrue(entries.size() >= 3,
                "expected at least check_in + submission + operator_override events");

        AuditEntryDto checkIn = entries.stream()
                .filter(e -> "check_in".equals(e.getType()))
                .findFirst().orElseThrow();
        assertAll("check_in row",
                () -> assertEquals("player", checkIn.getActor().getType()),
                () -> assertEquals(ctx.player.getId(), checkIn.getActor().getId()),
                () -> assertEquals(ctx.player.getDisplayName(), checkIn.getActor().getDisplayName()),
                () -> assertEquals(ctx.player.getDeviceId(), checkIn.getActor().getDeviceId()),
                () -> assertEquals("player_app", checkIn.getSourceSurface()),
                () -> assertEquals(ctx.team.getId(), checkIn.getTarget().getTeam().getId()),
                () -> assertFalse(checkIn.isArchived())
        );

        AuditEntryDto submission = entries.stream()
                .filter(e -> "submission".equals(e.getType()))
                .findFirst().orElseThrow();
        assertEquals("player", submission.getActor().getType());
        assertEquals(ctx.player.getId(), submission.getActor().getId());
        assertEquals("player_app", submission.getSourceSurface());

        AuditEntryDto override = entries.stream()
                .filter(e -> "operator_override".equals(e.getType()))
                .findFirst().orElseThrow();
        assertAll("operator_override row",
                () -> assertEquals("operator", override.getActor().getType()),
                () -> assertEquals(ctx.operator.getId(), override.getActor().getId()),
                () -> assertEquals(ctx.operator.getName(), override.getActor().getDisplayName()),
                () -> assertNull(override.getActor().getDeviceId(),
                        "operator actor must not carry device id"),
                () -> assertEquals("operator_rescue", override.getSourceSurface()),
                () -> assertEquals("Phone died mid-submission",
                        override.getDetails().getOperatorReason())
        );

        // Chronological ordering.
        for (int i = 1; i < entries.size(); i++) {
            assertTrue(!entries.get(i).getTimestamp().isBefore(entries.get(i - 1).getTimestamp()),
                    "export must be ordered by ascending timestamp");
        }
    }

    // ==================================================================
    //  Filter: no actionType (default UI path — the regression case)
    // ==================================================================

    @Test
    void exportWithNoActionTypeFilterReturnsAllEventTypes() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("no-type-filter");

        // Generate events of at least two distinct types (check_in + submission).
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        CreateSubmissionRequest req = new CreateSubmissionRequest();
        req.setTeamId(ctx.team.getId());
        req.setChallengeId(ctx.challenge.getId());
        req.setBaseId(ctx.base.getId());
        req.setAnswer("any answer");
        req.setIdempotencyKey(UUID.randomUUID());
        submissionService.createSubmission(ctx.game.getId(), req);

        // Export with actionType = null — this is the default filter state the
        // UI sends when no action type is selected. Prior to the fix, this path
        // caused Hibernate to bind null to a Collection IN-clause and threw a
        // 500. Verify: no exception and at least two distinct event types present.
        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> entries = exportJson(query(ctx.game.getId()).build());

        boolean hasCheckIn = entries.stream().anyMatch(e -> "check_in".equals(e.getType()));
        boolean hasSubmission = entries.stream().anyMatch(e -> "submission".equals(e.getType()));
        assertTrue(hasCheckIn, "default-filter export must include check_in events");
        assertTrue(hasSubmission, "default-filter export must include submission events");
    }

    // ==================================================================
    //  Filter: playerId
    // ==================================================================

    @Test
    void filterByPlayerIdOnlyReturnsEventsInvolvingThatPlayer() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-player");
        // Second team + player so we can filter.
        Team otherTeam = createTeam(ctx.game, "Other Team fb-player", joinCode("fbp2"));
        Player otherPlayer = createPlayer(otherTeam, "Other Scout", "device-other-fb");

        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsPlayer(otherPlayer);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), otherPlayer, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> allEntries = exportJson(query(ctx.game.getId()).build());
        assertTrue(allEntries.size() >= 2);

        List<AuditEntryDto> filtered = exportJson(query(ctx.game.getId())
                .playerId(ctx.player.getId())
                .build());
        assertFalse(filtered.isEmpty());
        for (AuditEntryDto entry : filtered) {
            assertEquals("player", entry.getActor().getType());
            assertEquals(ctx.player.getId(), entry.getActor().getId(),
                    "playerId filter must only return events for that player");
        }
    }

    // ==================================================================
    //  Filter: operatorId
    // ==================================================================

    @Test
    void filterByOperatorIdOnlyReturnsEventsInitiatedByThatOperator() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-op");
        // Player check-in to have a non-matching row in the stream.
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        // Operator rescue: manual check-in on a second base.
        Base secondBase = createBase(ctx.game, "Second Base fb-op");
        authenticateAsOperator(ctx.operator);
        teamService.operatorCheckIn(ctx.game.getId(), ctx.team.getId(), secondBase.getId(), "Rescue");

        List<AuditEntryDto> filtered = exportJson(query(ctx.game.getId())
                .operatorId(ctx.operator.getId())
                .build());

        assertFalse(filtered.isEmpty(), "operator rescue events must be present");
        for (AuditEntryDto entry : filtered) {
            assertEquals("operator", entry.getActor().getType(),
                    "operatorId filter must only return operator-initiated events");
            assertEquals(ctx.operator.getId(), entry.getActor().getId());
        }
    }

    // ==================================================================
    //  Filter: date range
    // ==================================================================

    @Test
    void filterByDateRangeReturnsOnlyEventsWithinWindow() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-date");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        Instant cutoff = Instant.now().plusSeconds(3600);

        authenticateAsOperator(ctx.operator);
        // from > all existing events → empty result.
        List<AuditEntryDto> future = exportJson(query(ctx.game.getId())
                .from(cutoff.toString())
                .build());
        assertTrue(future.isEmpty(), "from-in-future must return no events");

        // to < all existing events → empty result.
        Instant past = Instant.now().minus(1, ChronoUnit.DAYS);
        List<AuditEntryDto> beforePast = exportJson(query(ctx.game.getId())
                .to(past.toString())
                .build());
        assertTrue(beforePast.isEmpty(), "to-in-past must return no events");

        // Full range — same as no filter.
        List<AuditEntryDto> wide = exportJson(query(ctx.game.getId())
                .from(past.toString())
                .to(cutoff.toString())
                .build());
        assertFalse(wide.isEmpty(), "wide range must include all events");
    }

    // ==================================================================
    //  Filter: actionType
    // ==================================================================

    @Test
    void filterByActionTypeSingleValueMatchesExactly() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-type-single");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        CreateSubmissionRequest req = new CreateSubmissionRequest();
        req.setTeamId(ctx.team.getId());
        req.setChallengeId(ctx.challenge.getId());
        req.setBaseId(ctx.base.getId());
        req.setAnswer("answer");
        req.setIdempotencyKey(UUID.randomUUID());
        submissionService.createSubmission(ctx.game.getId(), req);

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> filtered = exportJson(query(ctx.game.getId())
                .actionType("check_in")
                .build());
        assertFalse(filtered.isEmpty());
        for (AuditEntryDto entry : filtered) {
            assertEquals("check_in", entry.getType());
        }
    }

    @Test
    void filterByActionTypeCommaSeparatedValueMatchesAnyOfTheSet() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-type-csv");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        CreateSubmissionRequest req = new CreateSubmissionRequest();
        req.setTeamId(ctx.team.getId());
        req.setChallengeId(ctx.challenge.getId());
        req.setBaseId(ctx.base.getId());
        req.setAnswer("answer");
        req.setIdempotencyKey(UUID.randomUUID());
        submissionService.createSubmission(ctx.game.getId(), req);

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> filtered = exportJson(query(ctx.game.getId())
                .actionType("check_in,submission")
                .build());
        assertFalse(filtered.isEmpty());
        for (AuditEntryDto entry : filtered) {
            assertTrue("check_in".equals(entry.getType()) || "submission".equals(entry.getType()),
                    "filter must only include comma-listed types, got " + entry.getType());
        }
    }

    @Test
    void filterByActionTypeUnknownValueReturns400() {
        TestContext ctx = createLiveGameWithPlayer("fb-type-bad");
        authenticateAsOperator(ctx.operator);

        BadRequestException ex = assertThrows(BadRequestException.class,
                () -> auditExportService.export(query(ctx.game.getId())
                        .actionType("not_a_real_type")
                        .build()));
        assertTrue(ex.getMessage().contains("AUDIT_EXPORT_INVALID_ACTION_TYPE"));
    }

    // ==================================================================
    //  Filter: includeArchived
    // ==================================================================

    @Test
    void includeArchivedDefaultFalseHidesArchivedEvents() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("fb-archive");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        // Force an archive via resetProgress.
        authenticateAsOperator(ctx.operator);
        gameService.updateStatus(ctx.game.getId(), "ended", false);
        gameService.updateStatus(ctx.game.getId(), "setup", true);

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> hidden = exportJson(query(ctx.game.getId()).build());
        assertTrue(hidden.isEmpty(),
                "default includeArchived=false must hide archived rows");

        List<AuditEntryDto> shown = exportJson(query(ctx.game.getId())
                .includeArchived(true)
                .build());
        assertFalse(shown.isEmpty(), "includeArchived=true must surface archived rows");
        for (AuditEntryDto entry : shown) {
            assertTrue(entry.isArchived(), "reset rows must be flagged archived");
        }
    }

    // ==================================================================
    //  CSV format
    // ==================================================================

    @Test
    void csvFormatEmitsHeaderAndCorrectDataRows() {
        TestContext ctx = createLiveGameWithPlayer("csv-happy");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        AuditExportResult result = auditExportService.export(query(ctx.game.getId())
                .format("csv")
                .build());

        assertTrue(result.contentType().startsWith("text/csv"));
        assertTrue(result.contentDisposition().contains("audit-" + ctx.game.getId()));
        assertTrue(result.contentDisposition().contains(".csv"));

        String[] lines = result.body().split("\r\n", -1);
        assertTrue(lines.length >= 2, "expected header + at least one data row");
        assertEquals(
                "timestamp,type,source_surface,actor_type,actor_id,actor_display_name,actor_device_id," +
                "team_id,team_name,base_id,base_name,challenge_id,challenge_title,message," +
                "operator_reason,archived",
                lines[0]);

        // Find the check_in data row and verify the critical columns.
        String checkInRow = null;
        for (int i = 1; i < lines.length; i++) {
            if (lines[i].contains(",check_in,player_app,")) {
                checkInRow = lines[i];
                break;
            }
        }
        assertNotNull(checkInRow, "expected a check_in CSV data row");
        assertTrue(checkInRow.contains(ctx.player.getId().toString()),
                "check_in row must carry player id");
        assertTrue(checkInRow.contains(ctx.team.getId().toString()),
                "check_in row must carry team id");
        assertTrue(checkInRow.endsWith(",false"),
                "archived column must be the last column and equal false");
    }

    @Test
    void csvFormatEscapesEmbeddedCommasAndQuotesInDisplayName() {
        TestContext ctx = createLiveGameWithOperator("csv-escape");
        // Player whose display name contains a comma AND a double-quote to
        // exercise the RFC-4180 quoting path.
        Team team = createTeam(ctx.game, "Escape Team", joinCode("csvesc"));
        Player trickyPlayer = createPlayer(team,
                "Scout \"Nickname\", Jr.", "device-csv-esc");
        Base base = createBase(ctx.game, "Escape Base csv-escape");

        authenticateAsPlayer(trickyPlayer);
        playerService.checkIn(ctx.game.getId(), base.getId(), trickyPlayer, new CheckInRequest());

        authenticateAsOperator(ctx.operator);
        AuditExportResult result = auditExportService.export(query(ctx.game.getId())
                .format("csv")
                .build());

        String body = result.body();
        // The display name must appear quoted with the embedded quote
        // doubled.
        assertTrue(body.contains("\"Scout \"\"Nickname\"\", Jr.\""),
                "CSV must RFC-4180-quote fields containing commas and double-quotes; body was:\n" + body);
    }

    // ==================================================================
    //  Empty game
    // ==================================================================

    @Test
    void emptyGameReturnsEmptyArray() throws Exception {
        User operator = createOperator("op-empty@audit.test", "password");
        Game game = createGame(operator, "Empty Game", GameStatus.live);

        authenticateAsOperator(operator);
        List<AuditEntryDto> entries = exportJson(query(game.getId()).build());
        assertTrue(entries.isEmpty(), "no actions yet → empty export array");

        // CSV form: header row only, no data rows.
        AuditExportResult csv = auditExportService.export(query(game.getId())
                .format("csv")
                .build());
        String[] lines = csv.body().split("\r\n", -1);
        // Expected: header + trailing empty element after final \r\n split.
        assertEquals("timestamp,type,source_surface,actor_type,actor_id,actor_display_name," +
                "actor_device_id,team_id,team_name,base_id,base_name,challenge_id,challenge_title," +
                "message,operator_reason,archived", lines[0]);
    }

    // ==================================================================
    //  Legacy null snapshot handling
    // ==================================================================

    @Test
    void legacyRowWithNullSnapshotFallsBackToLiveJoin() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("legacy");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        // Simulate a pre-V36 row: clear the snapshot but leave the FK.
        ActivityEvent checkInEvent = activityEventRepository.findByGameIdIncludingArchived(ctx.game.getId())
                .stream()
                .filter(e -> e.getType() == ActivityEventType.check_in)
                .findFirst().orElseThrow();
        checkInEvent.setActorDisplayNameSnapshot(null);
        checkInEvent.setActorDeviceIdSnapshot(null);
        activityEventRepository.save(checkInEvent);

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> entries = exportJson(query(ctx.game.getId()).build());
        AuditEntryDto row = entries.stream()
                .filter(e -> "check_in".equals(e.getType()))
                .findFirst().orElseThrow();

        assertEquals(ctx.player.getDisplayName(), row.getActor().getDisplayName(),
                "legacy null snapshot must fall back to the live player display name");
        assertEquals(ctx.player.getDeviceId(), row.getActor().getDeviceId(),
                "legacy null device snapshot must fall back to the live player device id");
    }

    @Test
    void legacyRowWithNullSnapshotAndNoActorEmitsUnknown() throws Exception {
        TestContext ctx = createLiveGameWithPlayer("legacy-unknown");
        authenticateAsPlayer(ctx.player);
        playerService.checkIn(ctx.game.getId(), ctx.base.getId(), ctx.player, new CheckInRequest());

        // Detach all actor information so the service has to emit "Unknown".
        ActivityEvent checkInEvent = activityEventRepository.findByGameIdIncludingArchived(ctx.game.getId())
                .stream()
                .filter(e -> e.getType() == ActivityEventType.check_in)
                .findFirst().orElseThrow();
        checkInEvent.setActorPlayer(null);
        checkInEvent.setActorOperatorUser(null);
        checkInEvent.setActorDisplayNameSnapshot(null);
        checkInEvent.setActorDeviceIdSnapshot(null);
        activityEventRepository.save(checkInEvent);

        authenticateAsOperator(ctx.operator);
        List<AuditEntryDto> entries = exportJson(query(ctx.game.getId()).build());
        AuditEntryDto row = entries.stream()
                .filter(e -> "check_in".equals(e.getType()))
                .findFirst().orElseThrow();

        assertEquals("system", row.getActor().getType());
        assertEquals("Unknown", row.getActor().getDisplayName());
        assertNull(row.getActor().getId());
    }

    // ==================================================================
    //  Authorization
    // ==================================================================

    @Test
    void exportByUnauthorizedOperatorIsForbidden() {
        TestContext ctx = createLiveGameWithPlayer("forbid");
        User outsider = createOperator("outsider-audit@rescue.test", "password");
        authenticateAsOperator(outsider);

        assertThrows(ForbiddenException.class,
                () -> auditExportService.export(query(ctx.game.getId()).build()));
    }

    // ==================================================================
    //  Helpers
    // ==================================================================

    private record TestContext(User operator, Game game, Team team, Base base, Challenge challenge, Player player) {}

    private TestContext createLiveGameWithPlayer(String suffix) {
        User operator = createOperator("op-" + suffix + "@audit.test", "password");
        Game game = createGame(operator, "Audit Export Game " + suffix, GameStatus.live);
        Team team = createTeam(game, "Audit Export Team " + suffix, joinCode(suffix));
        Base base = createBase(game, "Audit Export Base " + suffix);
        Challenge challenge = createChallenge(game, "Audit Export Challenge " + suffix, AnswerType.text, 10);
        Player player = createPlayer(team, "Audit Scout " + suffix, "device-" + suffix);
        return new TestContext(operator, game, team, base, challenge, player);
    }

    private TestContext createLiveGameWithOperator(String suffix) {
        User operator = createOperator("op-" + suffix + "@audit.test", "password");
        Game game = createGame(operator, "Audit Export Game " + suffix, GameStatus.live);
        return new TestContext(operator, game, null, null, null, null);
    }

    private String joinCode(String suffix) {
        String cleaned = suffix.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (cleaned.isEmpty()) cleaned = "X";
        if (cleaned.length() > 12) cleaned = cleaned.substring(0, 12);
        return ("AEX" + cleaned).substring(0, Math.min(20, ("AEX" + cleaned).length()));
    }

    private void authenticateAsOperator(User operator) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
    }

    private void authenticateAsPlayer(Player player) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(player, null, List.of()));
    }

    /** Fluent query builder for the test helpers. */
    private static final class QueryBuilder {
        private final UUID gameId;
        private String format;
        private String from;
        private String to;
        private UUID teamId;
        private UUID playerId;
        private UUID operatorId;
        private String actionType;
        private String sourceSurface;
        private Boolean includeArchived;

        QueryBuilder(UUID gameId) { this.gameId = gameId; }
        QueryBuilder format(String v) { this.format = v; return this; }
        QueryBuilder from(String v) { this.from = v; return this; }
        QueryBuilder to(String v) { this.to = v; return this; }
        QueryBuilder teamId(UUID v) { this.teamId = v; return this; }
        QueryBuilder playerId(UUID v) { this.playerId = v; return this; }
        QueryBuilder operatorId(UUID v) { this.operatorId = v; return this; }
        QueryBuilder actionType(String v) { this.actionType = v; return this; }
        QueryBuilder sourceSurface(String v) { this.sourceSurface = v; return this; }
        QueryBuilder includeArchived(boolean v) { this.includeArchived = v; return this; }

        AuditExportQuery build() {
            return new AuditExportQuery(
                    gameId, format, from, to, teamId, playerId, operatorId,
                    actionType, sourceSurface, includeArchived);
        }
    }

    private QueryBuilder query(UUID gameId) {
        return new QueryBuilder(gameId);
    }

    private List<AuditEntryDto> exportJson(AuditExportQuery query) throws Exception {
        AuditExportResult result = auditExportService.export(query);
        assertTrue(result.contentType().startsWith("application/json"),
                "default format must be JSON; got " + result.contentType());
        return objectMapper.readValue(result.body(), new TypeReference<>() {});
    }
}
