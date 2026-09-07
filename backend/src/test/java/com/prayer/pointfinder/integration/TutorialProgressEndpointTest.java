package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.TutorialProgressResponse;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.UserTutorialProgressRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The two tutorial-progress endpoints end to end: create, read back, complete,
 * restart, reject unknown ids, isolate operators, and refuse anonymous callers.
 */
class TutorialProgressEndpointTest extends IntegrationTestBase {

    private static final String PATH = "/api/users/me/tutorials";

    private static final ParameterizedTypeReference<List<TutorialProgressResponse>> LIST_TYPE =
            new ParameterizedTypeReference<>() {};

    @Autowired
    private UserTutorialProgressRepository progressRepository;

    @BeforeEach
    void clearProgress() {
        progressRepository.deleteAll();
    }

    private ResponseEntity<List<TutorialProgressResponse>> list(User user) {
        return restTemplate.exchange(
                PATH,
                HttpMethod.GET,
                new HttpEntity<>(headersWithAuth(operatorAuthHeader(user))),
                LIST_TYPE);
    }

    private ResponseEntity<TutorialProgressResponse> put(User user, String scenarioId, Map<String, Object> body) {
        return restTemplate.exchange(
                PATH + "/" + scenarioId,
                HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))),
                TutorialProgressResponse.class);
    }

    private static Map<String, Object> body(String status, String currentStep) {
        Map<String, Object> body = new HashMap<>();
        body.put("status", status);
        body.put("currentStep", currentStep);
        body.put("gameId", null);
        return body;
    }

    @Test
    void listStartsEmptyThenReflectsAnUpsert() {
        User operator = createOperator("endpoint-list@test.com", "password");

        ResponseEntity<List<TutorialProgressResponse>> empty = list(operator);
        assertEquals(HttpStatus.OK, empty.getStatusCode());
        assertNotNull(empty.getBody());
        assertTrue(empty.getBody().isEmpty());

        ResponseEntity<TutorialProgressResponse> created = put(operator, "first-game", body("in_progress", "place-base"));
        assertEquals(HttpStatus.OK, created.getStatusCode());
        assertNotNull(created.getBody());
        assertEquals("first-game", created.getBody().scenarioId());
        assertEquals("in_progress", created.getBody().status());

        ResponseEntity<List<TutorialProgressResponse>> after = list(operator);
        assertNotNull(after.getBody());
        assertEquals(1, after.getBody().size());
        assertEquals("place-base", after.getBody().get(0).currentStep());
    }

    @Test
    void completedSetsCompletedAtAndRestartClearsIt() {
        User operator = createOperator("endpoint-cycle@test.com", "password");

        ResponseEntity<TutorialProgressResponse> completed = put(operator, "first-game", body("completed", "finish"));
        assertEquals(HttpStatus.OK, completed.getStatusCode());
        assertNotNull(completed.getBody());
        assertNotNull(completed.getBody().completedAt());

        ResponseEntity<TutorialProgressResponse> restarted = put(operator, "first-game", body("in_progress", null));
        assertEquals(HttpStatus.OK, restarted.getStatusCode());
        assertNotNull(restarted.getBody());
        assertNull(restarted.getBody().completedAt());
        assertNull(restarted.getBody().currentStep());
        assertEquals("in_progress", restarted.getBody().status());
    }

    @Test
    void unknownScenarioIsRejectedWith400() {
        User operator = createOperator("endpoint-unknown@test.com", "password");

        ResponseEntity<String> response = restTemplate.exchange(
                PATH + "/not-a-tutorial",
                HttpMethod.PUT,
                new HttpEntity<>(body("in_progress", null), headersWithAuth(operatorAuthHeader(operator))),
                String.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("TUTORIAL_SCENARIO_UNKNOWN"), response.getBody());
    }

    @Test
    void unknownStatusIsRejectedWith400() {
        User operator = createOperator("endpoint-bad-status@test.com", "password");

        ResponseEntity<String> response = restTemplate.exchange(
                PATH + "/first-game",
                HttpMethod.PUT,
                new HttpEntity<>(body("paused", null), headersWithAuth(operatorAuthHeader(operator))),
                String.class);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("TUTORIAL_STATUS_UNKNOWN"), response.getBody());
    }

    @Test
    void oneOperatorCannotSeeAnothersRows() {
        User a = createOperator("endpoint-iso-a@test.com", "password");
        User b = createOperator("endpoint-iso-b@test.com", "password");

        put(a, "first-game", body("completed", "finish"));

        assertEquals(1, list(a).getBody().size());
        assertTrue(list(b).getBody().isEmpty());
    }

    @Test
    void anonymousCallersAreRefused() {
        ResponseEntity<String> response = restTemplate.exchange(
                PATH, HttpMethod.GET, new HttpEntity<>(null, null), String.class);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void aGameIdThatNoLongerExistsIsStoredAsNullInsteadOfFailing() {
        User operator = createOperator("endpoint-gone-game@test.com", "password");
        Map<String, Object> body = body("completed", "finish");
        body.put("gameId", UUID.randomUUID());

        ResponseEntity<TutorialProgressResponse> completed = put(operator, "first-game", body);

        assertEquals(HttpStatus.OK, completed.getStatusCode());
        assertNotNull(completed.getBody());
        assertEquals("completed", completed.getBody().status());
        assertNull(completed.getBody().gameId());
    }
}
