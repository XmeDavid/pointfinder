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
 * Integration tests for the submission review state machine.
 * Verifies all transitions: approve/reject from pending, re-approve, re-reject,
 * auto-validated submissions, and leaderboard point reflection.
 */
class SubmissionReviewTransitionsTest extends IntegrationTestBase {

    // ── Common setup helper ──────────────────────────────────────────

    /**
     * Creates a minimal live game and returns a ready-to-review submission ID.
     * Returns a context record with all needed IDs for further assertions.
     */
    private TestContext setupLiveGameWithPendingSubmission(String suffix) {
        User operator = createOperator("operator-review-" + suffix + "@test.com", "password123");
        String opAuth = operatorAuthHeader(operator);
        HttpHeaders opHeaders = headersWithAuth(opAuth);

        // Create game via API
        CreateGameRequest createGame = new CreateGameRequest();
        createGame.setName("Review Test Game " + suffix);
        ResponseEntity<GameResponse> gameResp = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(createGame, opHeaders), GameResponse.class);
        assertEquals(HttpStatus.CREATED, gameResp.getStatusCode());
        UUID gameId = gameResp.getBody().getId();

        // Create entities directly (faster than API)
        Game game = gameRepository.findById(gameId).orElseThrow();
        Base base = createBase(game, "Base " + suffix);
        Challenge challenge = createChallenge(game, "Challenge " + suffix, AnswerType.text, 100);
        Team team = createTeam(game, "Team " + suffix, "RVW" + suffix.toUpperCase());

        // Go live
        UpdateGameStatusRequest goLive = new UpdateGameStatusRequest();
        goLive.setStatus("live");
        ResponseEntity<GameResponse> liveResp = restTemplate.exchange(
                "/api/games/" + gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(goLive, opHeaders), GameResponse.class);
        assertEquals(HttpStatus.OK, liveResp.getStatusCode());

        // Player joins
        PlayerJoinRequest joinReq = new PlayerJoinRequest();
        joinReq.setJoinCode("RVW" + suffix.toUpperCase());
        joinReq.setDisplayName("Scout " + suffix);
        joinReq.setDeviceId("device-rvw-" + suffix);
        ResponseEntity<PlayerAuthResponse> joinResp = restTemplate.postForEntity(
                "/api/auth/player/join", joinReq, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, joinResp.getStatusCode());
        String playerAuth = "Bearer " + joinResp.getBody().getToken();
        HttpHeaders playerHeaders = headersWithAuth(playerAuth);

        // Player checks in
        restTemplate.exchange(
                "/api/player/games/" + gameId + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST, new HttpEntity<>(null, playerHeaders), CheckInResponse.class);

        // Player submits
        PlayerSubmissionRequest submitReq = new PlayerSubmissionRequest();
        submitReq.setBaseId(base.getId());
        submitReq.setChallengeId(challenge.getId());
        submitReq.setAnswer("my answer");
        ResponseEntity<SubmissionResponse> submitResp = restTemplate.exchange(
                "/api/player/games/" + gameId + "/submissions", HttpMethod.POST,
                new HttpEntity<>(submitReq, playerHeaders), SubmissionResponse.class);
        assertEquals(HttpStatus.CREATED, submitResp.getStatusCode());
        assertEquals("pending", submitResp.getBody().getStatus());

        return new TestContext(gameId, team.getId(), submitResp.getBody().getId(), operator, opHeaders);
    }

    private SubmissionResponse review(UUID gameId, UUID submissionId, HttpHeaders opHeaders,
                                      ReviewStatus status, Integer points) {
        ReviewSubmissionRequest req = new ReviewSubmissionRequest();
        req.setStatus(status);
        req.setPoints(points);
        ResponseEntity<SubmissionResponse> resp = restTemplate.exchange(
                "/api/games/" + gameId + "/submissions/" + submissionId + "/review",
                HttpMethod.PATCH, new HttpEntity<>(req, opHeaders), SubmissionResponse.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
        return resp.getBody();
    }

    private long leaderboardPoints(UUID gameId, UUID teamId, HttpHeaders opHeaders) {
        ResponseEntity<LeaderboardEntry[]> lb = restTemplate.exchange(
                "/api/games/" + gameId + "/monitoring/leaderboard",
                HttpMethod.GET, new HttpEntity<>(opHeaders), LeaderboardEntry[].class);
        assertEquals(HttpStatus.OK, lb.getStatusCode());
        for (LeaderboardEntry entry : lb.getBody()) {
            if (teamId.equals(entry.getTeamId())) return entry.getPoints();
        }
        return 0L;
    }

    // ── Tests ────────────────────────────────────────────────────────

    @Test
    void approvePendingSubmission_statusApprovedAndPointsAwarded() {
        TestContext ctx = setupLiveGameWithPendingSubmission("AP1");

        SubmissionResponse result = review(ctx.gameId, ctx.submissionId, ctx.opHeaders,
                ReviewStatus.approved, 100);

        assertEquals("approved", result.getStatus());
        assertEquals(100, result.getPoints());
        assertEquals(ctx.operator.getId(), result.getReviewedBy());
    }

    @Test
    void rejectPendingSubmission_statusBecomesRejected() {
        TestContext ctx = setupLiveGameWithPendingSubmission("RJ1");

        SubmissionResponse result = review(ctx.gameId, ctx.submissionId, ctx.opHeaders,
                ReviewStatus.rejected, null);

        assertEquals("rejected", result.getStatus());
        assertNull(result.getPoints());
    }

    @Test
    void reApproveRejectedSubmission_statusBecomesApproved() {
        TestContext ctx = setupLiveGameWithPendingSubmission("RAP");

        // First reject
        review(ctx.gameId, ctx.submissionId, ctx.opHeaders, ReviewStatus.rejected, null);

        // Then re-approve
        SubmissionResponse result = review(ctx.gameId, ctx.submissionId, ctx.opHeaders,
                ReviewStatus.approved, 75);

        assertEquals("approved", result.getStatus());
        assertEquals(75, result.getPoints());
    }

    @Test
    void reRejectApprovedSubmission_statusBecomesRejected() {
        TestContext ctx = setupLiveGameWithPendingSubmission("RRJ");

        // First approve
        review(ctx.gameId, ctx.submissionId, ctx.opHeaders, ReviewStatus.approved, 100);

        // Then re-reject
        SubmissionResponse result = review(ctx.gameId, ctx.submissionId, ctx.opHeaders,
                ReviewStatus.rejected, null);

        assertEquals("rejected", result.getStatus());
    }

    @Test
    void leaderboardReflectsPointsAfterApproval() {
        TestContext ctx = setupLiveGameWithPendingSubmission("LB1");

        assertEquals(0L, leaderboardPoints(ctx.gameId, ctx.teamId, ctx.opHeaders));

        review(ctx.gameId, ctx.submissionId, ctx.opHeaders, ReviewStatus.approved, 50);

        assertEquals(50L, leaderboardPoints(ctx.gameId, ctx.teamId, ctx.opHeaders));
    }

    @Test
    void leaderboardPointsDropToZeroAfterRejectingApproval() {
        TestContext ctx = setupLiveGameWithPendingSubmission("LB2");

        review(ctx.gameId, ctx.submissionId, ctx.opHeaders, ReviewStatus.approved, 100);
        assertEquals(100L, leaderboardPoints(ctx.gameId, ctx.teamId, ctx.opHeaders));

        review(ctx.gameId, ctx.submissionId, ctx.opHeaders, ReviewStatus.rejected, null);
        assertEquals(0L, leaderboardPoints(ctx.gameId, ctx.teamId, ctx.opHeaders));
    }

    @Test
    void autoValidatedSubmission_correctAnswerGetsCorrectStatus() {
        User operator = createOperator("operator-auto-" + System.nanoTime() + "@test.com", "password123");
        String opAuth = operatorAuthHeader(operator);
        HttpHeaders opHeaders = headersWithAuth(opAuth);

        CreateGameRequest createGame = new CreateGameRequest();
        createGame.setName("Auto-validate Game");
        ResponseEntity<GameResponse> gameResp = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(createGame, opHeaders), GameResponse.class);
        UUID gameId = gameResp.getBody().getId();

        Game game = gameRepository.findById(gameId).orElseThrow();
        Base base = createBase(game, "Auto Base");

        // Create ONLY the auto-validate challenge so it's guaranteed to be auto-assigned
        Challenge challenge = Challenge.builder()
                .game(game)
                .title("Auto Challenge")
                .description("Test challenge")
                .content("Challenge content")
                .completionContent("Well done!")
                .answerType(AnswerType.text)
                .autoValidate(true)
                .correctAnswer(java.util.List.of("42"))
                .points(80)
                .locationBound(false)
                .build();
        challengeRepository.save(challenge);
        Team team = createTeam(game, "Auto Team", "AUT001");

        // Go live — auto-assigns the one challenge to the one base for the one team
        UpdateGameStatusRequest goLive = new UpdateGameStatusRequest();
        goLive.setStatus("live");
        ResponseEntity<GameResponse> liveResp = restTemplate.exchange(
                "/api/games/" + gameId + "/status", HttpMethod.PATCH,
                new HttpEntity<>(goLive, opHeaders), GameResponse.class);
        assertEquals(HttpStatus.OK, liveResp.getStatusCode(), "Go-live should succeed");
        assertEquals("live", liveResp.getBody().getStatus());

        PlayerJoinRequest joinReq = new PlayerJoinRequest();
        joinReq.setJoinCode("AUT001");
        joinReq.setDisplayName("Auto Scout");
        joinReq.setDeviceId("device-auto-1");
        ResponseEntity<PlayerAuthResponse> joinResp = restTemplate.postForEntity(
                "/api/auth/player/join", joinReq, PlayerAuthResponse.class);
        HttpHeaders playerHeaders = headersWithAuth("Bearer " + joinResp.getBody().getToken());

        // Check in — get the assigned challenge from the check-in response
        ResponseEntity<CheckInResponse> checkInResp = restTemplate.exchange(
                "/api/player/games/" + gameId + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST, new HttpEntity<>(null, playerHeaders), CheckInResponse.class);
        assertEquals(HttpStatus.OK, checkInResp.getStatusCode());
        UUID assignedChallengeId = checkInResp.getBody().getChallenge().getId();

        PlayerSubmissionRequest submitReq = new PlayerSubmissionRequest();
        submitReq.setBaseId(base.getId());
        submitReq.setChallengeId(assignedChallengeId);
        submitReq.setAnswer("42");
        ResponseEntity<SubmissionResponse> submitResp = restTemplate.exchange(
                "/api/player/games/" + gameId + "/submissions", HttpMethod.POST,
                new HttpEntity<>(submitReq, playerHeaders), SubmissionResponse.class);

        assertEquals(HttpStatus.CREATED, submitResp.getStatusCode());
        // Auto-validated correct answer → "correct" status (not pending), points awarded immediately
        assertEquals("correct", submitResp.getBody().getStatus());
        assertEquals(80, submitResp.getBody().getPoints());

        // "correct" submissions can be re-reviewed by operators (e.g. to override auto-validation)
        UUID submissionId = submitResp.getBody().getId();
        ReviewSubmissionRequest reviewReq = new ReviewSubmissionRequest();
        reviewReq.setStatus(ReviewStatus.approved);
        reviewReq.setPoints(80);
        ResponseEntity<SubmissionResponse> reviewResp = restTemplate.exchange(
                "/api/games/" + gameId + "/submissions/" + submissionId + "/review",
                HttpMethod.PATCH, new HttpEntity<>(reviewReq, opHeaders), SubmissionResponse.class);
        assertEquals(HttpStatus.OK, reviewResp.getStatusCode());
    }

    // ── Helper record ────────────────────────────────────────────────

    private record TestContext(UUID gameId, UUID teamId, UUID submissionId,
                               User operator, HttpHeaders opHeaders) {}
}
