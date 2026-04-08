package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.*;
import com.prayer.pointfinder.repository.GameRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;

import java.util.Iterator;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Full end-to-end coverage of {@code GET /api/games/{gameId}/snapshot}.
 *
 * <p>Source spec: docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md
 * (P0 Track 2 Slice 1).
 *
 * <p><strong>NO SCORES IN PLAYER SHAPE.</strong> The player-role tests below
 * walk the serialized JSON and assert that the words {@code score},
 * {@code points}, {@code leaderboard}, and {@code rank} do not appear as
 * object keys anywhere in the response. This is a structural guarantee the
 * DTO design enforces — the test locks it in so a future field addition
 * cannot silently leak scoring into the player app.
 */
class GameSnapshotEndpointTest extends IntegrationTestBase {

    @Autowired
    private GameRepository gameRepositoryAutowired;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void playerSnapshotReturnsPlayerShapeWithNoScoreFields() throws Exception {
        Setup setup = setupLiveGameWithPlayer("snap-1");
        String playerAuth = playerAuthHeader(setup.player);

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(playerAuth)),
                String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());

        JsonNode root = objectMapper.readTree(response.getBody());

        // Top-level player shape keys
        assertTrue(root.has("stateVersion"), "stateVersion must be present");
        assertTrue(root.has("serverTime"), "serverTime must be present");
        assertTrue(root.has("game"), "game must be present");
        assertTrue(root.has("team"), "team must be present");
        assertTrue(root.has("progress"), "progress must be present");
        assertTrue(root.has("submissions"), "submissions must be present");
        assertTrue(root.has("uploadSessions"), "uploadSessions must be present");

        // No operator-only keys leak in
        assertFalse(root.has("leaderboard"), "player snapshot must NOT carry leaderboard");
        assertFalse(root.has("pendingReviews"), "player snapshot must NOT carry pendingReviews");
        assertFalse(root.has("activeUploads"), "player snapshot must NOT carry activeUploads");
        assertFalse(root.has("needsAttention"), "player snapshot must NOT carry needsAttention");
        assertFalse(root.has("teams"), "player snapshot must NOT carry operator teams list");

        // stateVersion is at least the number of broadcasts the go-live
        // transition triggered — we never want it to be zero after go-live.
        assertTrue(root.get("stateVersion").asLong() > 0,
                "stateVersion should be bumped at least once by go-live broadcast");

        // Structurally assert no score/leaderboard/rank/points key anywhere
        assertNoScoreKeysInTree(root, "$");

        // Game info sanity
        JsonNode game = root.get("game");
        assertEquals(setup.game.getId().toString(), game.get("id").asText());
        assertEquals("live", game.get("status").asText());

        // Team info — no score field
        JsonNode team = root.get("team");
        assertEquals(setup.team.getId().toString(), team.get("id").asText());
        assertFalse(team.has("score"), "player team info must NOT carry score");
        assertFalse(team.has("points"), "player team info must NOT carry points");
    }

    @Test
    void operatorSnapshotReturnsOperatorShapeWithLeaderboard() throws Exception {
        Setup setup = setupLiveGameWithPlayer("snap-2");
        String opAuth = operatorAuthHeader(setup.operator);

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(opAuth)),
                String.class);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());

        JsonNode root = objectMapper.readTree(response.getBody());

        // Top-level operator shape keys
        assertTrue(root.has("stateVersion"));
        assertTrue(root.has("serverTime"));
        assertTrue(root.has("game"));
        assertTrue(root.has("teams"));
        assertTrue(root.has("leaderboard"));
        assertTrue(root.has("pendingReviews"));
        assertTrue(root.has("activeUploads"));
        assertTrue(root.has("needsAttention"));

        // Operator-specific game fields present
        JsonNode game = root.get("game");
        assertTrue(game.has("uniformAssignment"));

        // Leaderboard is an array (possibly empty, but present)
        assertTrue(root.get("leaderboard").isArray());

        // Teams list has our test team, with a score field
        JsonNode teams = root.get("teams");
        assertTrue(teams.isArray());
        assertEquals(1, teams.size());
        JsonNode teamInfo = teams.get(0);
        assertEquals(setup.team.getId().toString(), teamInfo.get("id").asText());
        assertTrue(teamInfo.has("score"), "operator team info must carry score");
        assertEquals(0, teamInfo.get("score").asLong()); // no scored submissions yet

        // Counters are non-negative ints
        assertTrue(root.get("pendingReviews").asInt() >= 0);
        assertTrue(root.get("activeUploads").asInt() >= 0);
        assertTrue(root.get("needsAttention").asInt() >= 0);
    }

    @Test
    void playerSnapshotForWrongGameReturns403() {
        Setup a = setupLiveGameWithPlayer("snap-wrong-1");
        // Build a completely separate game with a different operator.
        Setup b = setupLiveGameWithPlayer("snap-wrong-2");

        // Player from game A calls snapshot for game B — must be 403.
        String playerAuth = playerAuthHeader(a.player);

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/games/" + b.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(playerAuth)),
                String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void operatorSnapshotForUnownedGameReturns403() {
        Setup a = setupLiveGameWithPlayer("snap-wrong-op-1");

        // A fresh, unrelated operator without access to game A.
        User stranger = createOperator("stranger@snap.test", "password123");
        String strangerAuth = operatorAuthHeader(stranger);

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/games/" + a.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(strangerAuth)),
                String.class);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void snapshotWithoutJwtReturns401() {
        Setup setup = setupLiveGameWithPlayer("snap-anon");

        HttpHeaders noAuth = new HttpHeaders();
        noAuth.set("Content-Type", "application/json");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(noAuth),
                String.class);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void stateVersionAdvancesAfterStateMutatingBroadcast() throws Exception {
        Setup setup = setupLiveGameWithPlayer("snap-version");
        String opAuth = operatorAuthHeader(setup.operator);

        // Initial snapshot
        ResponseEntity<String> first = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(opAuth)),
                String.class);
        long firstVersion = objectMapper.readTree(first.getBody()).get("stateVersion").asLong();

        // Trigger a state-mutating broadcast by transitioning live -> ended
        com.prayer.pointfinder.dto.request.UpdateGameStatusRequest req =
                new com.prayer.pointfinder.dto.request.UpdateGameStatusRequest();
        req.setStatus("ended");
        ResponseEntity<String> patch = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/status",
                HttpMethod.PATCH,
                new HttpEntity<>(req, headersWithAuth(opAuth)),
                String.class);
        assertEquals(HttpStatus.OK, patch.getStatusCode());

        // Second snapshot — state version must have advanced
        ResponseEntity<String> second = restTemplate.exchange(
                "/api/games/" + setup.game.getId() + "/snapshot",
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(opAuth)),
                String.class);
        long secondVersion = objectMapper.readTree(second.getBody()).get("stateVersion").asLong();

        assertTrue(secondVersion > firstVersion,
                "stateVersion should advance after game_status broadcast: " + firstVersion + " -> " + secondVersion);

        // And the snapshot reflects the new status
        assertEquals("ended", objectMapper.readTree(second.getBody()).get("game").get("status").asText());
    }

    // ── Helpers ────────────────────────────────────────────────────────

    private record Setup(User operator, Game game, Team team, Base base, Challenge challenge, Player player) {}

    private Setup setupLiveGameWithPlayer(String suffix) {
        User operator = createOperator("op-" + suffix + "@snap.test", "password123");
        Game game = createGame(operator, "Snap Game " + suffix, GameStatus.setup);
        Base base = createBase(game, "Base " + suffix);
        Challenge challenge = createChallenge(game, "Challenge " + suffix, AnswerType.text, 10);
        Team team = createTeam(game, "Team " + suffix, "SNAP-" + suffix.toUpperCase());
        Player player = createPlayer(team, "Player " + suffix, "device-" + suffix);

        // Transition through the public endpoint so the real GoLive flow and
        // its associated broadcasts run. This also produces a real
        // state_version bump, so the snapshot can assert version > 0.
        com.prayer.pointfinder.dto.request.UpdateGameStatusRequest goLive =
                new com.prayer.pointfinder.dto.request.UpdateGameStatusRequest();
        goLive.setStatus("live");
        ResponseEntity<String> liveResp = restTemplate.exchange(
                "/api/games/" + game.getId() + "/status",
                HttpMethod.PATCH,
                new HttpEntity<>(goLive, headersWithAuth(operatorAuthHeader(operator))),
                String.class);
        assertEquals(HttpStatus.OK, liveResp.getStatusCode(),
                "go-live should succeed; body=" + liveResp.getBody());

        Game refreshed = gameRepositoryAutowired.findById(game.getId()).orElseThrow();
        return new Setup(operator, refreshed, team, base, challenge, player);
    }

    /**
     * Recursively walks a JSON tree and fails the test if any object field
     * name looks like a scoring/leaderboard/rank/points key. This is how the
     * "no scores in player snapshot" product rule becomes a compile-time-ish
     * guarantee: the DTO cannot grow those fields without this test lighting
     * up immediately.
     */
    private static void assertNoScoreKeysInTree(JsonNode node, String path) {
        if (node == null || node.isNull()) return;
        if (node.isObject()) {
            Iterator<String> fieldNames = node.fieldNames();
            while (fieldNames.hasNext()) {
                String name = fieldNames.next();
                String lowered = name.toLowerCase();
                // "points" is overloaded — the challenge entity has a
                // numeric points value — but the player snapshot must NOT
                // carry it. Same for score/leaderboard/rank.
                assertFalse(lowered.equals("score"),
                        "found forbidden 'score' key at " + path + "." + name);
                assertFalse(lowered.equals("points"),
                        "found forbidden 'points' key at " + path + "." + name);
                assertFalse(lowered.equals("leaderboard"),
                        "found forbidden 'leaderboard' key at " + path + "." + name);
                assertFalse(lowered.equals("rank"),
                        "found forbidden 'rank' key at " + path + "." + name);
                assertFalse(lowered.equals("totalpoints"),
                        "found forbidden 'totalPoints' key at " + path + "." + name);
                assertNoScoreKeysInTree(node.get(name), path + "." + name);
            }
        } else if (node.isArray()) {
            for (int i = 0; i < node.size(); i++) {
                assertNoScoreKeysInTree(node.get(i), path + "[" + i + "]");
            }
        }
    }
}
