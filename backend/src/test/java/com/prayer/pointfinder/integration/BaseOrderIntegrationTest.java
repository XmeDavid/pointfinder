package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.entity.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import static org.junit.jupiter.api.Assertions.*;

class BaseOrderIntegrationTest extends IntegrationTestBase {
    @Test
    void sharedBaseRouteEnforcesTeamVisitsAndPreservesDifferentAssignedChallenges() {
        User operator = createOperator("route@integration.test", "password123");
        Game game = createGame(operator, "Ordered", GameStatus.live);
        game.setEnforceBaseOrder(true);
        game = gameRepository.save(game);
        Base first = createBase(game, "First");
        Base second = createBase(game, "Second");
        first.setOrderIndex(0); first.setNfcToken("first001"); baseRepository.save(first);
        second.setOrderIndex(1); second.setNfcToken("second02"); baseRepository.save(second);
        Team a = createTeam(game, "A", "ROUTEA");
        Team b = createTeam(game, "B", "ROUTEB");
        Player playerA = createPlayer(a, "Alice", "route-device-a");
        Player playerB = createPlayer(b, "Bob", "route-device-b");
        Challenge challengeA = createChallenge(game, "A task", AnswerType.text, 10);
        Challenge challengeB = createChallenge(game, "B task", AnswerType.text, 10);
        assignmentRepository.save(Assignment.builder().game(game).base(second).team(a).challenge(challengeA).build());
        assignmentRepository.save(Assignment.builder().game(game).base(second).team(b).challenge(challengeB).build());
        String baseUrl = "/api/player/games/" + game.getId() + "/bases/";
        HttpHeaders headersA = headersWithAuth(playerAuthHeader(playerA));
        HttpHeaders headersB = headersWithAuth(playerAuthHeader(playerB));
        var rejected = restTemplate.exchange(baseUrl + second.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(second), headersA), JsonNode.class);
        assertEquals(HttpStatus.BAD_REQUEST, rejected.getStatusCode());
        assertEquals("PREVIOUS_BASE_REQUIRED", rejected.getBody().get("code").asText());
        assertEquals("1", rejected.getBody().path("errors").path("nextRequiredBaseNumber").asText());
        assertEquals(0, checkInRepository.count());

        assertEquals(HttpStatus.OK, restTemplate.exchange(baseUrl + first.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(first), headersA), CheckInResponse.class).getStatusCode());
        var acceptedA = restTemplate.exchange(baseUrl + second.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(second), headersA), CheckInResponse.class);
        assertEquals(HttpStatus.OK, acceptedA.getStatusCode());
        assertEquals(challengeA.getId(), acceptedA.getBody().challenge().id());
        assertEquals(HttpStatus.BAD_REQUEST, restTemplate.exchange(baseUrl + second.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(second), headersB), JsonNode.class).getStatusCode());
        assertEquals(HttpStatus.OK, restTemplate.exchange(baseUrl + first.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(first), headersB), CheckInResponse.class).getStatusCode());
        var acceptedB = restTemplate.exchange(baseUrl + second.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(second), headersB), CheckInResponse.class);
        assertEquals(challengeB.getId(), acceptedB.getBody().challenge().id());
        assertEquals(0, submissionRepository.count());

        var snapshot = restTemplate.exchange("/api/games/" + game.getId() + "/snapshot", HttpMethod.GET,
                new HttpEntity<>(headersA), JsonNode.class).getBody();
        assertNotNull(snapshot);
        assertTrue(snapshot.path("game").path("enforceBaseOrder").asBoolean());
        assertTrue(snapshot.path("game").has("nextRequiredBaseNumber"));
        assertTrue(snapshot.path("game").get("nextRequiredBaseNumber").isNull());
        assertEquals(2, snapshot.path("progress").size());
        assertTrue(snapshot.path("progress").get(0).has("sequenceNumber"));

        var settings = new UpdateGameRequest(); settings.setName("Ordered"); settings.setEnforceBaseOrder(false);
        var frozen = restTemplate.exchange("/api/games/" + game.getId(), HttpMethod.PUT,
                new HttpEntity<>(settings, headersWithAuth(operatorAuthHeader(operator))), JsonNode.class);
        assertEquals(HttpStatus.BAD_REQUEST, frozen.getStatusCode());
        assertEquals("BASE_ORDER_LOCKED", frozen.getBody().path("code").asText());
    }
}
