package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.dto.response.PlayerAuthResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration coverage for the Wave B backend-security remediation:
 * <ul>
 *   <li>nfcToken required on check-in (error {@code NFC_TOKEN_REQUIRED})</li>
 *   <li>device→team switching rejected (error {@code DEVICE_ALREADY_IN_DIFFERENT_TEAM})</li>
 *   <li>per-IP and per-device rate limit on player join (error {@code RATE_LIMITED})</li>
 *   <li>tokenVersion bump on password reset invalidates prior JWTs</li>
 * </ul>
 */
class WaveBSecurityIntegrationTest extends IntegrationTestBase {

    @Autowired
    private PlayerJoinRateLimiter rateLimiter;

    // ── Helpers ────────────────────────────────────────────────────────

    private Game createLiveGameWithBase(User operator, String baseName, String nfcToken) {
        Game game = createGame(operator, "Wave B Game " + UUID.randomUUID(), GameStatus.live);
        Base base = Base.builder()
                .game(game)
                .name(baseName)
                .description("")
                .lat(47.0)
                .lng(8.0)
                .nfcLinked(true)
                .nfcToken(nfcToken)
                .build();
        baseRepository.save(base);
        return game;
    }

    // ── 1) nfcToken required on check-in ───────────────────────────────

    @Test
    void checkInReturns400WithNfcTokenRequiredWhenTokenMissing() {
        rateLimiter.clear();
        User operator = createOperator("nfc-required-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Alpha", "nfctkn01");
        Team team = createTeam(game, "Team A", "NFCREQ01");
        Base base = baseRepository.findByGameId(game.getId()).get(0);

        // Player joins
        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode());
        join.setDisplayName("Scout");
        join.setDeviceId("nfc-req-dev-1");
        ResponseEntity<PlayerAuthResponse> joinResp = restTemplate.postForEntity(
                "/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, joinResp.getStatusCode());
        String playerToken = joinResp.getBody().getToken();

        // Check in WITHOUT nfcToken: @Valid should fire, producing 400
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + playerToken);
        headers.set("Content-Type", "application/json");
        ResponseEntity<Map> resp = restTemplate.exchange(
                "/api/player/games/" + game.getId() + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST,
                new HttpEntity<>(new CheckInRequest(), headers),
                Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertNotNull(resp.getBody());
        // Either the bean-validation path (errors.nfcToken) OR the service-layer
        // guard (code == NFC_TOKEN_REQUIRED) must catch it.
        boolean beanValidation = resp.getBody().containsKey("errors")
                && ((Map<?, ?>) resp.getBody().get("errors")).containsKey("nfcToken");
        boolean serviceGuard = "NFC_TOKEN_REQUIRED".equals(resp.getBody().get("code"));
        assertTrue(beanValidation || serviceGuard,
                "Expected NFC_TOKEN_REQUIRED at bean-validation or service layer, got: " + resp.getBody());
    }

    @Test
    void checkInSucceedsWhenNfcTokenMatches() {
        rateLimiter.clear();
        User operator = createOperator("nfc-ok-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Beta", "good-nfc");
        Team team = createTeam(game, "Team B", "NFCOK001");
        Base base = baseRepository.findByGameId(game.getId()).get(0);
        // Assign challenge to the base so check-in can project challenge info
        Challenge challenge = createChallenge(game, "Quiz", AnswerType.text, 10);
        com.prayer.pointfinder.entity.Assignment a = com.prayer.pointfinder.entity.Assignment.builder()
                .game(game).base(base).challenge(challenge).team(null).build();
        assignmentRepository.save(a);

        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode());
        join.setDisplayName("Scout");
        join.setDeviceId("nfc-ok-dev-1");
        ResponseEntity<PlayerAuthResponse> joinResp = restTemplate.postForEntity(
                "/api/auth/player/join", join, PlayerAuthResponse.class);
        String playerToken = joinResp.getBody().getToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + playerToken);
        headers.set("Content-Type", "application/json");
        CheckInRequest body = new CheckInRequest();
        body.setNfcToken("good-nfc");
        ResponseEntity<CheckInResponse> resp = restTemplate.exchange(
                "/api/player/games/" + game.getId() + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST,
                new HttpEntity<>(body, headers),
                CheckInResponse.class);
        assertEquals(HttpStatus.OK, resp.getStatusCode());
    }

    // ── 2) Device→team switching rejected ──────────────────────────────

    @Test
    void rejoinWithDifferentTeamSameDeviceReturnsDeviceAlreadyInDifferentTeam() {
        rateLimiter.clear();
        User operator = createOperator("switch-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Alpha", "nfc-x");
        Team teamA = createTeam(game, "Team A", "SWITCHAA");
        Team teamB = createTeam(game, "Team B", "SWITCHBB");

        String deviceId = "switch-dev-1";
        PlayerJoinRequest first = new PlayerJoinRequest();
        first.setJoinCode(teamA.getJoinCode());
        first.setDisplayName("Scout");
        first.setDeviceId(deviceId);
        ResponseEntity<PlayerAuthResponse> firstResp = restTemplate.postForEntity(
                "/api/auth/player/join", first, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, firstResp.getStatusCode());
        assertEquals(teamA.getId(), firstResp.getBody().getTeam().getId());

        // Same device tries to switch to team B -- rejected.
        PlayerJoinRequest second = new PlayerJoinRequest();
        second.setJoinCode(teamB.getJoinCode());
        second.setDisplayName("Scout");
        second.setDeviceId(deviceId);
        ResponseEntity<Map> secondResp = restTemplate.postForEntity(
                "/api/auth/player/join", second, Map.class);
        assertEquals(HttpStatus.BAD_REQUEST, secondResp.getStatusCode());
        assertEquals("DEVICE_ALREADY_IN_DIFFERENT_TEAM", secondResp.getBody().get("code"));
    }

    @Test
    void rejoinWithSameTeamSameDeviceSucceedsIdempotently() {
        rateLimiter.clear();
        User operator = createOperator("idemp-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Alpha", "nfc-x");
        Team team = createTeam(game, "Team A", "IDEMPOTA");
        String deviceId = "idemp-dev-1";

        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode());
        join.setDisplayName("Scout");
        join.setDeviceId(deviceId);
        ResponseEntity<PlayerAuthResponse> first = restTemplate.postForEntity(
                "/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, first.getStatusCode());
        UUID firstPlayerId = first.getBody().getPlayer().getId();

        // Rejoin on same team must succeed and return the same player row.
        ResponseEntity<PlayerAuthResponse> second = restTemplate.postForEntity(
                "/api/auth/player/join", join, PlayerAuthResponse.class);
        assertEquals(HttpStatus.OK, second.getStatusCode());
        assertEquals(firstPlayerId, second.getBody().getPlayer().getId());
    }

    // ── 3) Rate limit ──────────────────────────────────────────────────

    @Test
    void playerJoinPerDeviceRateLimitTripsAtAttempt21() {
        rateLimiter.clear();
        User operator = createOperator("rl-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Alpha", "nfc-x");
        Team team = createTeam(game, "Team A", "RLDEVICE");

        String deviceId = "rl-dev-1";
        PlayerJoinRequest req = new PlayerJoinRequest();
        req.setJoinCode(team.getJoinCode());
        req.setDisplayName("Scout");
        req.setDeviceId(deviceId);

        // 20 legitimate attempts: all succeed (200 OK).
        for (int i = 0; i < 20; i++) {
            ResponseEntity<Map> r = restTemplate.postForEntity("/api/auth/player/join", req, Map.class);
            assertEquals(HttpStatus.OK, r.getStatusCode(),
                    "attempt " + (i + 1) + " should succeed, got " + r.getStatusCode());
        }

        // 21st attempt: rate limited.
        ResponseEntity<Map> tripped = restTemplate.postForEntity("/api/auth/player/join", req, Map.class);
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, tripped.getStatusCode());
        assertEquals("RATE_LIMITED", tripped.getBody().get("code"));
    }

    @Test
    void playerJoinPerIpRateLimitTripsAtAttempt11() {
        rateLimiter.clear();
        User operator = createOperator("rl-ip-op@test.com", "Password1");
        Game game = createLiveGameWithBase(operator, "Alpha", "nfc-x");
        Team team = createTeam(game, "Team A", "RLIPTEST");

        PlayerJoinRequest req = new PlayerJoinRequest();
        req.setJoinCode(team.getJoinCode());
        req.setDisplayName("Scout");

        // 10 attempts from distinct deviceIds all share the same source IP.
        for (int i = 0; i < 10; i++) {
            req.setDeviceId("rl-ip-dev-" + i);
            ResponseEntity<Map> r = restTemplate.postForEntity("/api/auth/player/join", req, Map.class);
            assertEquals(HttpStatus.OK, r.getStatusCode(),
                    "attempt " + (i + 1) + " should succeed, got " + r.getStatusCode());
        }

        // 11th (new device, same IP) trips the IP bucket.
        req.setDeviceId("rl-ip-dev-11");
        ResponseEntity<Map> tripped = restTemplate.postForEntity("/api/auth/player/join", req, Map.class);
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, tripped.getStatusCode());
        assertEquals("RATE_LIMITED", tripped.getBody().get("code"));
    }

    // ── 4) tokenVersion bump invalidates prior JWTs ────────────────────

    @Test
    void bumpingTokenVersionRejectsExistingOperatorJwt() {
        rateLimiter.clear();
        User operator = createOperator("tv-bump-op@test.com", "Password1");
        String originalJwt = operatorAuthHeader(operator); // minted at tv=0

        // Baseline: the token works.
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", originalJwt);
        ResponseEntity<Map> beforeBump = restTemplate.exchange(
                "/api/users/me", HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertEquals(HttpStatus.OK, beforeBump.getStatusCode());

        // Bump the user's token_version in the DB -- simulates a password reset
        // or role change committing. The JWT's embedded tv (0) is now stale.
        operator.setTokenVersion(1);
        userRepository.save(operator);

        ResponseEntity<Map> afterBump = restTemplate.exchange(
                "/api/users/me", HttpMethod.GET, new HttpEntity<>(headers), Map.class);
        assertEquals(HttpStatus.UNAUTHORIZED, afterBump.getStatusCode());
    }
}
