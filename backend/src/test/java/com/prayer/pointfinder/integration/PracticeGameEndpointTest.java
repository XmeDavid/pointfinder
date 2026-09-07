package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.TutorialStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.entity.UserTutorialProgressId;
import com.prayer.pointfinder.repository.GameRepository;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import com.prayer.pointfinder.service.GameSchedulerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Practice games end to end: seeded creation and binding, one at a time,
 * the first-game dialog path, the single-player rule, keep, delete and expiry.
 */
class PracticeGameEndpointTest extends IntegrationTestBase {

    private static final String TUTORIALS = "/api/users/me/tutorials";

    @Autowired
    private UserTutorialProgressRepository progressRepository;
    @Autowired
    private GameRepository gameRepository;
    @Autowired
    private GameSchedulerService gameSchedulerService;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    private ResponseEntity<GameResponse> practice(User user, String scenarioId, Map<String, Object> body) {
        return restTemplate.exchange(
                TUTORIALS + "/" + scenarioId + "/practice-game",
                HttpMethod.POST,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))),
                GameResponse.class);
    }

    private ResponseEntity<String> practiceRaw(User user, String scenarioId, Map<String, Object> body) {
        return restTemplate.exchange(
                TUTORIALS + "/" + scenarioId + "/practice-game",
                HttpMethod.POST,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))),
                String.class);
    }

    private static Map<String, Object> practiceBody(String name) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("lat", 41.15);
        body.put("lng", -8.61);
        return body;
    }

    private long count(String table, UUID gameId) {
        Long n = jdbcTemplate.queryForObject("SELECT count(*) FROM " + table + " WHERE game_id = ?", Long.class, gameId);
        return n != null ? n : -1;
    }

    @Test
    void fixedRoutePracticeGameIsSeededAndBoundToTheProgressRow() {
        User operator = createOperator("practice-seed@test.com", "password");

        ResponseEntity<GameResponse> created = practice(operator, "fixed-route", practiceBody("Practice: fixed route"));

        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        GameResponse game = created.getBody();
        assertNotNull(game);
        assertEquals("fixed-route", game.tutorialScenario());
        assertNotNull(game.tutorialExpiresAt());
        assertTrue(game.tutorialExpiresAt().isAfter(Instant.now().plusSeconds(23 * 3600)));
        assertEquals("setup", game.status());
        assertEquals("QR", game.defaultCheckInMethod());

        assertEquals(3, count("bases", game.id()));
        assertEquals(3, count("challenges", game.id()));
        assertEquals(3, count("assignments", game.id()));
        assertEquals(1, count("teams", game.id()));

        var row = progressRepository.findById(new UserTutorialProgressId(operator.getId(), "fixed-route")).orElseThrow();
        assertEquals(TutorialStatus.IN_PROGRESS, row.getStatus());
        assertNull(row.getCurrentStep());
        assertEquals(game.id(), row.getGameId());
    }

    @Test
    void explorationSeedsTwoChallengesAndFirstGameIsNotSeedable() {
        User operator = createOperator("practice-expl@test.com", "password");

        ResponseEntity<GameResponse> created = practice(operator, "exploration", practiceBody("Practice: exploration"));
        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        assertEquals(2, count("challenges", created.getBody().id()));
        assertEquals(2, count("assignments", created.getBody().id()));

        User other = createOperator("practice-first@test.com", "password");
        ResponseEntity<String> refused = practiceRaw(other, "first-game", practiceBody("Nope"));
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertTrue(refused.getBody().contains("TUTORIAL_PRACTICE_GAME_NOT_ALLOWED"));

        ResponseEntity<String> unknown = practiceRaw(other, "no-such", practiceBody("Nope"));
        assertEquals(HttpStatus.BAD_REQUEST, unknown.getStatusCode());
        assertTrue(unknown.getBody().contains("TUTORIAL_SCENARIO_UNKNOWN"));
    }

    @Test
    void onlyOnePracticeGameAtATimeUntilItIsDeletedOrKept() {
        User operator = createOperator("practice-one@test.com", "password");
        ResponseEntity<GameResponse> first = practice(operator, "fixed-route", practiceBody("One"));
        assertEquals(HttpStatus.CREATED, first.getStatusCode());

        ResponseEntity<String> second = practiceRaw(operator, "exploration", practiceBody("Two"));
        assertEquals(HttpStatus.CONFLICT, second.getStatusCode());
        assertTrue(second.getBody().contains("TUTORIAL_PRACTICE_GAME_EXISTS"));

        ResponseEntity<Void> deleted = restTemplate.exchange(
                "/api/games/" + first.getBody().id(),
                HttpMethod.DELETE,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(operator))),
                Void.class);
        assertEquals(HttpStatus.NO_CONTENT, deleted.getStatusCode());

        ResponseEntity<GameResponse> third = practice(operator, "exploration", practiceBody("Three"));
        assertEquals(HttpStatus.CREATED, third.getStatusCode());
        assertEquals("exploration", third.getBody().tutorialScenario());
    }

    @Test
    void keepClearsTheMarkerAndFreesTheSlot() {
        User operator = createOperator("practice-keep@test.com", "password");
        GameResponse practiceGame = practice(operator, "fixed-route", practiceBody("Keep me")).getBody();
        assertNotNull(practiceGame);

        ResponseEntity<GameResponse> kept = restTemplate.exchange(
                "/api/games/" + practiceGame.id() + "/keep",
                HttpMethod.POST,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(operator))),
                GameResponse.class);
        assertEquals(HttpStatus.OK, kept.getStatusCode());
        assertNull(kept.getBody().tutorialScenario());
        assertNull(kept.getBody().tutorialExpiresAt());

        ResponseEntity<String> again = restTemplate.exchange(
                "/api/games/" + practiceGame.id() + "/keep",
                HttpMethod.POST,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(operator))),
                String.class);
        assertEquals(HttpStatus.BAD_REQUEST, again.getStatusCode());
        assertTrue(again.getBody().contains("TUTORIAL_NOT_PRACTICE_GAME"));

        assertEquals(HttpStatus.CREATED, practice(operator, "exploration", practiceBody("Next")).getStatusCode());
    }

    @Test
    void theCreateDialogMarksAGameOnlyDuringAFirstGameRun() {
        User operator = createOperator("practice-dialog@test.com", "password");

        Map<String, Object> plain = new HashMap<>();
        plain.put("name", "Real event");
        plain.put("tutorialScenario", "first-game");
        ResponseEntity<GameResponse> noRun = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(plain, headersWithAuth(operatorAuthHeader(operator))), GameResponse.class);
        assertEquals(HttpStatus.CREATED, noRun.getStatusCode());
        assertNull(noRun.getBody().tutorialScenario());

        Map<String, Object> progress = new HashMap<>();
        progress.put("status", "in_progress");
        progress.put("currentStep", null);
        progress.put("gameId", null);
        assertEquals(HttpStatus.OK, restTemplate.exchange(
                TUTORIALS + "/first-game", HttpMethod.PUT,
                new HttpEntity<>(progress, headersWithAuth(operatorAuthHeader(operator))), String.class).getStatusCode());

        Map<String, Object> inRun = new HashMap<>();
        inRun.put("name", "My first game");
        inRun.put("tutorialScenario", "first-game");
        ResponseEntity<GameResponse> marked = restTemplate.exchange(
                "/api/games", HttpMethod.POST,
                new HttpEntity<>(inRun, headersWithAuth(operatorAuthHeader(operator))), GameResponse.class);
        assertEquals(HttpStatus.CREATED, marked.getStatusCode());
        assertEquals("first-game", marked.getBody().tutorialScenario());
        assertNotNull(marked.getBody().tutorialExpiresAt());
        var row = progressRepository.findById(new UserTutorialProgressId(operator.getId(), "first-game")).orElseThrow();
        assertEquals(marked.getBody().id(), row.getGameId());
    }

    @Test
    void aPracticeGameTakesASinglePlayer() {
        User operator = createOperator("practice-player@test.com", "password");
        GameResponse game = practice(operator, "fixed-route", practiceBody("Players")).getBody();
        assertNotNull(game);
        String joinCode = jdbcTemplate.queryForObject(
                "SELECT join_code FROM teams WHERE game_id = ?", String.class, game.id());

        assertEquals(HttpStatus.OK, join(joinCode, "Ana", "device-a").getStatusCode());
        ResponseEntity<String> second = join(joinCode, "Bruno", "device-b");
        assertEquals(HttpStatus.BAD_REQUEST, second.getStatusCode());
        assertTrue(second.getBody().contains("TUTORIAL_PRACTICE_GAME_PLAYER_LIMIT"));
        // The same device rejoining is idempotent, not a second player.
        assertEquals(HttpStatus.OK, join(joinCode, "Ana", "device-a").getStatusCode());
    }

    private ResponseEntity<String> join(String joinCode, String displayName, String deviceId) {
        Map<String, Object> body = new HashMap<>();
        body.put("joinCode", joinCode);
        body.put("displayName", displayName);
        body.put("deviceId", deviceId);
        return restTemplate.postForEntity("/api/auth/player/join", body, String.class);
    }

    @Test
    void expiredPracticeGamesAreEndedByTheScheduler() {
        User operator = createOperator("practice-expire@test.com", "password");
        GameResponse game = practice(operator, "fixed-route", practiceBody("Expiring")).getBody();
        assertNotNull(game);
        jdbcTemplate.update("UPDATE games SET tutorial_expires_at = ? WHERE id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), game.id());

        gameSchedulerService.expirePracticeGames();

        assertEquals(GameStatus.ended, gameRepository.findById(game.id()).orElseThrow().getStatus());
        // Ended, so the slot is free again.
        assertEquals(HttpStatus.CREATED, practice(operator, "exploration", practiceBody("After")).getStatusCode());
    }

    @Test
    void theThreeAdvancedScenariosSeedTheirOwnPracticeGames() {
        User chain = createOperator("practice-chain@test.com", "password");
        GameResponse unlock = practice(chain, "unlock-chain", practiceBody("Chain")).getBody();
        assertNotNull(unlock);
        assertEquals(6, count("bases", unlock.id()));
        assertEquals(6, count("challenges", unlock.id()));
        Long hidden = jdbcTemplate.queryForObject("SELECT count(*) FROM bases WHERE game_id = ? AND hidden = true", Long.class, unlock.id());
        assertEquals(5L, hidden);
        Long links = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM challenge_unlocks_bases cub JOIN challenges c ON c.id = cub.challenge_id WHERE c.game_id = ?", Long.class, unlock.id());
        assertEquals(4L, links); // bridge→tower, bridge→ford, tower→cache, ford→summit; trailhead→bridge is the lesson

        User path = createOperator("practice-path@test.com", "password");
        GameResponse different = practice(path, "different-path", practiceBody("Paths")).getBody();
        assertNotNull(different);
        assertEquals(3, count("bases", different.id()));
        assertEquals(3, count("challenges", different.id()));
        assertEquals(2, count("teams", different.id()));
        assertEquals(0, count("assignments", different.id()));

        User variable = createOperator("practice-variable@test.com", "password");
        GameResponse outcome = practice(variable, "variable-outcome", practiceBody("Variables")).getBody();
        assertNotNull(outcome);
        assertEquals(3, count("bases", outcome.id()));
        assertEquals(2, count("assignments", outcome.id()));
        Long pinned = jdbcTemplate.queryForObject("SELECT count(*) FROM bases WHERE game_id = ? AND fixed_challenge_id IS NOT NULL", Long.class, outcome.id());
        assertEquals(1L, pinned);
    }
}
