package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.UpdateGameRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.entity.*;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.List;
import java.util.UUID;
import org.springframework.http.*;
import static org.junit.jupiter.api.Assertions.*;

class BaseOrderIntegrationTest extends IntegrationTestBase {
    @Autowired private com.prayer.pointfinder.repository.StageRepository stageRepository;

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

    @Test
    void routesAreScopedToStagesAndTheFlagIsSetupOnly() {
        User operator = createOperator("stageroute@integration.test", "password123");
        Game game = createGame(operator, "Staged", GameStatus.setup);
        Base e1 = createBase(game, "Explore 1"); e1.setOrderIndex(0); e1.setNfcToken("expl0001"); baseRepository.save(e1);
        Base e2 = createBase(game, "Explore 2"); e2.setOrderIndex(1); e2.setNfcToken("expl0002"); baseRepository.save(e2);
        Base r1 = createBase(game, "Race 1"); r1.setOrderIndex(2); r1.setNfcToken("race0001"); baseRepository.save(r1);
        Base r2 = createBase(game, "Race 2"); r2.setOrderIndex(3); r2.setNfcToken("race0002"); baseRepository.save(r2);
        HttpHeaders op = headersWithAuth(operatorAuthHeader(operator));

        // The first stage captures every base; the race stage is created ordered and takes the race bases.
        var explore = restTemplate.exchange("/api/games/" + game.getId() + "/stages", HttpMethod.POST,
                new HttpEntity<>(java.util.Map.of("name", "Explore", "transitionType", "manual"), op), JsonNode.class).getBody();
        var race = restTemplate.exchange("/api/games/" + game.getId() + "/stages", HttpMethod.POST,
                new HttpEntity<>(java.util.Map.of("name", "Race", "transitionType", "manual", "enforceBaseOrder", true), op), JsonNode.class).getBody();
        assertFalse(explore.get("enforceBaseOrder").asBoolean());
        assertTrue(race.get("enforceBaseOrder").asBoolean());
        UUID raceId = UUID.fromString(race.get("id").asText());
        for (Base b : List.of(r1, r2)) { b.setStageId(raceId); baseRepository.save(b); }
        stageRepository.findById(raceId).ifPresent(st -> { st.setIsActive(true); stageRepository.save(st); });

        Team a = createTeam(game, "A", "STAGEA1");
        Player playerA = createPlayer(a, "Alice", "stage-device-a");
        HttpHeaders headersA = headersWithAuth(playerAuthHeader(playerA));
        game.setStatus(GameStatus.live); gameRepository.save(game);
        String baseUrl = "/api/player/games/" + game.getId() + "/bases/";

        // Explore bases are free in any order; the race must start at its first base.
        assertEquals(HttpStatus.OK, restTemplate.exchange(baseUrl + e2.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(e2), headersA), CheckInResponse.class).getStatusCode());
        var blocked = restTemplate.exchange(baseUrl + r2.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(r2), headersA), JsonNode.class);
        assertEquals(HttpStatus.BAD_REQUEST, blocked.getStatusCode());
        assertEquals("1", blocked.getBody().path("errors").path("nextRequiredBaseNumber").asText());
        assertEquals(HttpStatus.OK, restTemplate.exchange(baseUrl + r1.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(r1), headersA), CheckInResponse.class).getStatusCode());
        assertEquals(HttpStatus.OK, restTemplate.exchange(baseUrl + r2.getId() + "/check-in", HttpMethod.POST,
                new HttpEntity<>(checkInRequestFor(r2), headersA), CheckInResponse.class).getStatusCode());

        var snapshot = restTemplate.exchange("/api/games/" + game.getId() + "/snapshot", HttpMethod.GET,
                new HttpEntity<>(headersA), JsonNode.class).getBody();
        assertTrue(snapshot.path("game").path("enforceBaseOrder").asBoolean());
        assertEquals(2, snapshot.path("game").path("routes").size());
        JsonNode raceRoute = null;
        for (JsonNode r : snapshot.path("game").path("routes")) if (raceId.toString().equals(r.path("stageId").asText(null))) raceRoute = r;
        assertTrue(raceRoute.path("enforceBaseOrder").asBoolean());
        assertTrue(raceRoute.path("nextRequiredBaseNumber").isNull(), "the race route is finished");
        for (JsonNode row : snapshot.path("progress")) {
            boolean inRace = raceId.toString().equals(row.path("stageId").asText(null));
            assertEquals(inRace, !row.path("sequenceNumber").isNull(), "only the ordered stage numbers its bases");
        }

        // The flag is a setup-time structure.
        var locked = restTemplate.exchange("/api/games/" + game.getId() + "/stages/" + raceId, HttpMethod.PUT,
                new HttpEntity<>(java.util.Map.of("name", "Race", "transitionType", "manual", "enforceBaseOrder", false), op), JsonNode.class);
        assertEquals(HttpStatus.BAD_REQUEST, locked.getStatusCode());
        assertEquals("BASE_ORDER_LOCKED", locked.getBody().path("code").asText());
    }
}
