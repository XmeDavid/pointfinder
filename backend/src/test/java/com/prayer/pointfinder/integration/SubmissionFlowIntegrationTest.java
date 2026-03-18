package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.*;
import com.prayer.pointfinder.dto.response.*;
import com.prayer.pointfinder.entity.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Full golden-path integration test covering the complete submission lifecycle:
 * 1. Operator creates game infrastructure
 * 2. Player joins, checks in, submits answer
 * 3. Operator reviews, leaderboard updates
 *
 * Uses Testcontainers PostgreSQL via IntegrationTestBase.
 */
class SubmissionFlowIntegrationTest extends IntegrationTestBase {

    @Test
    void fullSubmissionFlowGoldenPath() {
        // ── Step 1: Operator setup ──────────────────────────────────
        User operator = createOperator("operator@flow.com", "password123");
        String opAuth = operatorAuthHeader(operator);

        // Create game
        HttpHeaders opHeaders = headersWithAuth(opAuth);
        CreateGameRequest createGame = new CreateGameRequest();
        createGame.setName("Flow Test Game");

        ResponseEntity<GameResponse> gameResp = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(createGame, opHeaders),
                GameResponse.class);

        assertEquals(HttpStatus.CREATED, gameResp.getStatusCode());
        assertNotNull(gameResp.getBody());
        UUID gameId = gameResp.getBody().getId();
        assertEquals("setup", gameResp.getBody().getStatus());

        // Create base
        Game game = gameRepository.findById(gameId).orElseThrow();
        Base base = createBase(game, "Base Alpha");

        // Create challenge
        Challenge challenge = createChallenge(game, "Find the answer", AnswerType.text, 100);

        // Create team
        Team team = createTeam(game, "Pathfinders", "FLOW01");

        // ── Step 2: Go live ─────────────────────────────────────────
        // We need at least 1 base (NFC linked), 1 challenge, 1 team
        // The auto-assignment happens during go-live
        UpdateGameStatusRequest goLive = new UpdateGameStatusRequest();
        goLive.setStatus("live");

        ResponseEntity<GameResponse> liveResp = restTemplate.exchange(
                "/api/games/" + gameId + "/status",
                HttpMethod.PATCH,
                new HttpEntity<>(goLive, opHeaders),
                GameResponse.class);

        assertEquals(HttpStatus.OK, liveResp.getStatusCode());
        assertEquals("live", liveResp.getBody().getStatus());

        // ── Step 3: Player joins ────────────────────────────────────
        PlayerJoinRequest joinReq = new PlayerJoinRequest();
        joinReq.setJoinCode("FLOW01");
        joinReq.setDisplayName("Scout Alice");
        joinReq.setDeviceId("device-flow-1");

        ResponseEntity<PlayerAuthResponse> joinResp = restTemplate.postForEntity(
                "/api/auth/player/join", joinReq, PlayerAuthResponse.class);

        assertEquals(HttpStatus.OK, joinResp.getStatusCode());
        assertNotNull(joinResp.getBody());
        assertNotNull(joinResp.getBody().getToken());
        assertEquals("Pathfinders", joinResp.getBody().getTeam().getName());

        String playerAuth = "Bearer " + joinResp.getBody().getToken();
        HttpHeaders playerHeaders = headersWithAuth(playerAuth);
        UUID playerId = joinResp.getBody().getPlayer().getId();

        // ── Step 4: Player checks in at base ────────────────────────
        ResponseEntity<CheckInResponse> checkInResp = restTemplate.exchange(
                "/api/player/games/" + gameId + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST,
                new HttpEntity<>(null, playerHeaders),
                CheckInResponse.class);

        assertEquals(HttpStatus.OK, checkInResp.getStatusCode());
        assertNotNull(checkInResp.getBody());
        assertEquals(base.getId(), checkInResp.getBody().getBaseId());
        assertEquals("Base Alpha", checkInResp.getBody().getBaseName());
        // Challenge should be assigned
        assertNotNull(checkInResp.getBody().getChallenge());

        UUID assignedChallengeId = checkInResp.getBody().getChallenge().getId();

        // ── Step 5: Player submits answer ───────────────────────────
        PlayerSubmissionRequest submitReq = new PlayerSubmissionRequest();
        submitReq.setBaseId(base.getId());
        submitReq.setChallengeId(assignedChallengeId);
        submitReq.setAnswer("42");

        ResponseEntity<SubmissionResponse> submitResp = restTemplate.exchange(
                "/api/player/games/" + gameId + "/submissions",
                HttpMethod.POST,
                new HttpEntity<>(submitReq, playerHeaders),
                SubmissionResponse.class);

        assertEquals(HttpStatus.CREATED, submitResp.getStatusCode());
        assertNotNull(submitResp.getBody());
        assertEquals("pending", submitResp.getBody().getStatus());
        assertEquals("42", submitResp.getBody().getAnswer());
        UUID submissionId = submitResp.getBody().getId();

        // ── Step 6: Operator reviews and approves ───────────────────
        ReviewSubmissionRequest reviewReq = new ReviewSubmissionRequest();
        reviewReq.setStatus("approved");
        reviewReq.setPoints(100);

        ResponseEntity<SubmissionResponse> reviewResp = restTemplate.exchange(
                "/api/games/" + gameId + "/submissions/" + submissionId + "/review",
                HttpMethod.PATCH,
                new HttpEntity<>(reviewReq, opHeaders),
                SubmissionResponse.class);

        assertEquals(HttpStatus.OK, reviewResp.getStatusCode());
        assertNotNull(reviewResp.getBody());
        assertEquals("approved", reviewResp.getBody().getStatus());
        assertEquals(100, reviewResp.getBody().getPoints());
        assertEquals(operator.getId(), reviewResp.getBody().getReviewedBy());

        // ── Step 7: Verify leaderboard reflects the points ──────────
        ResponseEntity<LeaderboardEntry[]> leaderboardResp = restTemplate.exchange(
                "/api/games/" + gameId + "/monitoring/leaderboard",
                HttpMethod.GET,
                new HttpEntity<>(opHeaders),
                LeaderboardEntry[].class);

        assertEquals(HttpStatus.OK, leaderboardResp.getStatusCode());
        assertNotNull(leaderboardResp.getBody());
        assertTrue(leaderboardResp.getBody().length > 0);

        LeaderboardEntry entry = leaderboardResp.getBody()[0];
        assertEquals(team.getId(), entry.getTeamId());
        assertEquals(100, entry.getPoints());
        assertEquals(1, entry.getCompletedChallenges());
    }
}
