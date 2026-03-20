package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration tests for game lifecycle status transitions.
 *
 * Valid transitions:
 *   setup -> live     (requires go-live prerequisites)
 *   live  -> ended
 *   ended -> setup    (with optional resetProgress)
 *   ended -> live     (re-live)
 *   live  -> setup    (revert to setup)
 *
 * Invalid transitions:
 *   setup -> ended    (not allowed)
 *   same  -> same     (no-op rejected)
 */
class GameStatusTransitionsTest extends IntegrationTestBase {

    // ── Setup helpers ────────────────────────────────────────────────

    private GameContext createReadyGame(String suffix) {
        User operator = createOperator("lifecycle-" + suffix + "@test.com", "password123");
        HttpHeaders opHeaders = headersWithAuth(operatorAuthHeader(operator));

        CreateGameRequest req = new CreateGameRequest();
        req.setName("Lifecycle Game " + suffix);
        ResponseEntity<GameResponse> resp = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(req, opHeaders), GameResponse.class);
        assertEquals(HttpStatus.CREATED, resp.getStatusCode());
        UUID gameId = resp.getBody().getId();

        Game game = gameRepository.findById(gameId).orElseThrow();
        createBase(game, "Base " + suffix);
        createChallenge(game, "Challenge " + suffix, AnswerType.text, 50);
        createTeam(game, "Team " + suffix, "LC" + suffix.toUpperCase());

        return new GameContext(gameId, opHeaders);
    }

    private ResponseEntity<GameResponse> transition(GameContext ctx, String status) {
        UpdateGameStatusRequest req = new UpdateGameStatusRequest();
        req.setStatus(status);
        return restTemplate.exchange(
                "/api/games/" + ctx.gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(req, ctx.opHeaders), GameResponse.class);
    }

    private ResponseEntity<String> transitionExpectError(GameContext ctx, String status) {
        UpdateGameStatusRequest req = new UpdateGameStatusRequest();
        req.setStatus(status);
        return restTemplate.exchange(
                "/api/games/" + ctx.gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(req, ctx.opHeaders), String.class);
    }

    private ResponseEntity<GameResponse> transitionWithReset(GameContext ctx, String status, boolean resetProgress) {
        UpdateGameStatusRequest req = new UpdateGameStatusRequest();
        req.setStatus(status);
        req.setResetProgress(resetProgress);
        return restTemplate.exchange(
                "/api/games/" + ctx.gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(req, ctx.opHeaders), GameResponse.class);
    }

    // ── Valid transitions ────────────────────────────────────────────

    @Test
    void setupToLive_validTransition() {
        GameContext ctx = createReadyGame("SL1");

        ResponseEntity<GameResponse> resp = transition(ctx, "live");

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("live", resp.getBody().getStatus());
    }

    @Test
    void liveToEnded_validTransition() {
        GameContext ctx = createReadyGame("LE1");
        transition(ctx, "live");

        ResponseEntity<GameResponse> resp = transition(ctx, "ended");

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("ended", resp.getBody().getStatus());
    }

    @Test
    void endedToSetup_validTransition() {
        GameContext ctx = createReadyGame("ES1");
        transition(ctx, "live");
        transition(ctx, "ended");

        ResponseEntity<GameResponse> resp = transition(ctx, "setup");

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("setup", resp.getBody().getStatus());
    }

    @Test
    void endedToSetupWithResetProgress_clearsSubmissionsAndCheckIns() {
        GameContext ctx = createReadyGame("ESR");

        // Go live and create player activity
        transition(ctx, "live");

        Game game = gameRepository.findById(ctx.gameId).orElseThrow();
        Team team = teamRepository.findByGameId(ctx.gameId).get(0);
        Base base = baseRepository.findByGameId(ctx.gameId).get(0);
        Challenge challenge = challengeRepository.findByGameId(ctx.gameId).get(0);

        // Create a player and check-in/submission directly
        Player player = createPlayer(team, "Scout ESR", "device-esr-1");
        CheckIn checkIn = CheckIn.builder()
                .game(game)
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(java.time.Instant.now())
                .build();
        checkInRepository.save(checkIn);

        Submission submission = Submission.builder()
                .team(team)
                .challenge(challenge)
                .base(base)
                .answer("test answer")
                .status(SubmissionStatus.pending)
                .submittedAt(java.time.Instant.now())
                .build();
        submissionRepository.save(submission);

        // Verify data exists
        assertEquals(1, submissionRepository.findByTeamId(team.getId()).size());

        transition(ctx, "ended");

        // Reset to setup with progress cleared
        ResponseEntity<GameResponse> resp = transitionWithReset(ctx, "setup", true);

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("setup", resp.getBody().getStatus());

        // Verify submissions and check-ins were cleared
        assertEquals(0, submissionRepository.findByTeamId(team.getId()).size());
        assertEquals(0, checkInRepository.findByGameIdWithRelations(ctx.gameId).size());
    }

    @Test
    void endedToLive_validTransition() {
        GameContext ctx = createReadyGame("EL1");
        transition(ctx, "live");
        transition(ctx, "ended");

        // ended -> live is valid (re-live)
        ResponseEntity<GameResponse> resp = transition(ctx, "live");

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("live", resp.getBody().getStatus());
    }

    @Test
    void liveToSetup_validTransition() {
        GameContext ctx = createReadyGame("LS1");
        transition(ctx, "live");

        ResponseEntity<GameResponse> resp = transition(ctx, "setup");

        assertEquals(HttpStatus.OK, resp.getStatusCode());
        assertEquals("setup", resp.getBody().getStatus());
    }

    // ── Invalid transitions ──────────────────────────────────────────

    @Test
    void setupToEnded_invalidTransition() {
        GameContext ctx = createReadyGame("SE_INV");
        // setup -> ended is not in the valid transitions

        ResponseEntity<String> resp = transitionExpectError(ctx, "ended");

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("Cannot transition") || resp.getBody().contains("cannot"),
                "Error should mention invalid transition");
    }

    @Test
    void sameStatus_noOpRejected_setup() {
        GameContext ctx = createReadyGame("SS_SETUP");

        ResponseEntity<String> resp = transitionExpectError(ctx, "setup");

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("already") || resp.getBody().contains("same"),
                "Error should mention already in state");
    }

    @Test
    void sameStatus_noOpRejected_live() {
        GameContext ctx = createReadyGame("SS_LIVE");
        transition(ctx, "live");

        ResponseEntity<String> resp = transitionExpectError(ctx, "live");

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("already") || resp.getBody().contains("same"),
                "Error should mention already in state");
    }

    @Test
    void sameStatus_noOpRejected_ended() {
        GameContext ctx = createReadyGame("SS_END");
        transition(ctx, "live");
        transition(ctx, "ended");

        ResponseEntity<String> resp = transitionExpectError(ctx, "ended");

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().contains("already") || resp.getBody().contains("same"),
                "Error should mention already in state");
    }

    @Test
    void invalidStatusString_rejected() {
        GameContext ctx = createReadyGame("INV_STR");

        ResponseEntity<String> resp = transitionExpectError(ctx, "invalid_status");

        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    // ── Helper record ─────────────────────────────────────────────────

    private record GameContext(UUID gameId, HttpHeaders opHeaders) {}
}
