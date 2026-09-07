package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Practice games with quota enforcement switched on: a free operator at the
 * one-active-game limit can still create one, cannot keep it or revive an
 * ended game over the limit, and the database refuses a second unended
 * practice game per creator.
 */
@TestPropertySource(properties = "app.quota.enforcement-enabled=true")
class PracticeGameQuotaTest extends IntegrationTestBase {

    private static final String TUTORIALS = "/api/users/me/tutorials";

    @Autowired
    private UserTutorialProgressRepository progressRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    private static Map<String, Object> practiceBody(String name) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        return body;
    }

    private <T> ResponseEntity<T> call(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    @Test
    void aFreeOperatorAtTheLimitCanPractiseButNotKeepOrCreateAnotherRealGame() {
        User operator = createOperator("quota-practice@test.com", "password");
        createGame(operator, "The real event", GameStatus.setup); // the one free slot

        ResponseEntity<GameResponse> practice = call(operator, HttpMethod.POST,
                TUTORIALS + "/fixed-route/practice-game", practiceBody("Practice"), GameResponse.class);
        assertEquals(HttpStatus.CREATED, practice.getStatusCode());
        UUID practiceId = practice.getBody().id();

        ResponseEntity<String> keep = call(operator, HttpMethod.POST, "/api/games/" + practiceId + "/keep", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, keep.getStatusCode());
        assertTrue(keep.getBody().contains("QUOTA_ACTIVE_GAMES_EXCEEDED"));

        // Ending the practice game first does not open a side door.
        jdbcTemplate.update("UPDATE games SET status = 'ended' WHERE id = ?", practiceId);
        ResponseEntity<String> keepEnded = call(operator, HttpMethod.POST, "/api/games/" + practiceId + "/keep", null, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, keepEnded.getStatusCode());
        assertTrue(keepEnded.getBody().contains("QUOTA_ACTIVE_GAMES_EXCEEDED"));

        Map<String, Object> plain = new HashMap<>();
        plain.put("name", "Second real event");
        ResponseEntity<String> create = call(operator, HttpMethod.POST, "/api/games", plain, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, create.getStatusCode());
        assertTrue(create.getBody().contains("QUOTA_ACTIVE_GAMES_EXCEEDED"));
    }

    @Test
    void revivingAnEndedRealGameCountsAgainstTheLimit() {
        User operator = createOperator("quota-revive@test.com", "password");
        createGame(operator, "Active", GameStatus.setup);
        Game ended = createGame(operator, "Finished", GameStatus.ended);

        Map<String, Object> body = new HashMap<>();
        body.put("status", "setup");
        ResponseEntity<String> revive = call(operator, HttpMethod.PATCH, "/api/games/" + ended.getId() + "/status", body, String.class);
        assertEquals(HttpStatus.BAD_REQUEST, revive.getStatusCode());
        assertTrue(revive.getBody().contains("QUOTA_ACTIVE_GAMES_EXCEEDED"));
    }

    @Test
    void keepSucceedsOnceASlotIsFree() {
        User operator = createOperator("quota-keep-ok@test.com", "password");
        ResponseEntity<GameResponse> practice = call(operator, HttpMethod.POST,
                TUTORIALS + "/exploration/practice-game", practiceBody("Practice"), GameResponse.class);
        assertEquals(HttpStatus.CREATED, practice.getStatusCode());

        ResponseEntity<GameResponse> kept = call(operator, HttpMethod.POST,
                "/api/games/" + practice.getBody().id() + "/keep", null, GameResponse.class);
        assertEquals(HttpStatus.OK, kept.getStatusCode());
        assertNotNull(kept.getBody());
        assertEquals(null, kept.getBody().tutorialScenario());
    }

    @Test
    void theDatabaseRefusesASecondUnendedPracticeGamePerCreator() {
        User operator = createOperator("quota-index@test.com", "password");
        Game first = createGame(operator, "One", GameStatus.setup);
        Game second = createGame(operator, "Two", GameStatus.setup);
        Timestamp expiry = Timestamp.from(Instant.now().plusSeconds(3600));
        jdbcTemplate.update("UPDATE games SET tutorial_scenario = 'fixed-route', tutorial_expires_at = ? WHERE id = ?", expiry, first.getId());

        assertThrows(DataIntegrityViolationException.class, () ->
                jdbcTemplate.update("UPDATE games SET tutorial_scenario = 'exploration', tutorial_expires_at = ? WHERE id = ?", expiry, second.getId()));

        // An ended practice game does not hold the slot.
        jdbcTemplate.update("UPDATE games SET status = 'ended' WHERE id = ?", first.getId());
        jdbcTemplate.update("UPDATE games SET tutorial_scenario = 'exploration', tutorial_expires_at = ? WHERE id = ?", expiry, second.getId());
    }
}
