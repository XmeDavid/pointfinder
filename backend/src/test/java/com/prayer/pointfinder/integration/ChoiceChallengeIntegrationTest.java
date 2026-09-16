package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-34 end to end: an operator authors a choice challenge, the player sees
 * options without the key, the server grades the selection, and templates
 * carry the options.
 */
class ChoiceChallengeIntegrationTest extends IntegrationTestBase {

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private JsonNode node(ResponseEntity<String> r) {
        try { return json.readTree(r.getBody()); } catch (Exception e) { throw new RuntimeException(e); }
    }

    private static Map<String, Object> option(String text, boolean correct) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("text", text); o.put("correct", correct);
        return o;
    }

    @Test
    void authorGradeAndCarryAMultipleChoiceChallenge() {
        User operator = createOperator("choice-" + UUID.randomUUID() + "@test.com", "Password1");
        HttpHeaders op = headersWithAuth(operatorAuthHeader(operator));
        Game game = createGame(operator, "Trees", GameStatus.setup);
        Base base = createBase(game, "Grove");
        Team team = createTeam(game, "Owls", "OWLS" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        Player player = createPlayer(team, "Rita", "choice-device-" + UUID.randomUUID());

        // Author: two correct options out of three; a single-choice body with two correct ones is refused.
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Which are conifers?");
        body.put("answerType", "multiple_choice");
        body.put("points", 30);
        body.put("choiceOptions", List.of(option("Pine", true), option("Oak", false), option("Fir", true)));
        JsonNode created = node(restTemplate.exchange("/api/games/" + game.getId() + "/challenges", HttpMethod.POST, new HttpEntity<>(body, op), String.class));
        UUID challengeId = UUID.fromString(created.get("id").asText());
        assertEquals(3, created.get("choiceOptions").size());
        assertTrue(created.get("autoValidate").asBoolean());
        String pineId = created.get("choiceOptions").get(0).get("id").asText();
        String oakId = created.get("choiceOptions").get(1).get("id").asText();
        String firId = created.get("choiceOptions").get(2).get("id").asText();

        Map<String, Object> bad = new LinkedHashMap<>(body);
        bad.put("answerType", "single_choice");
        ResponseEntity<String> refused = restTemplate.exchange("/api/games/" + game.getId() + "/challenges", HttpMethod.POST, new HttpEntity<>(bad, op), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertEquals("CHOICE_OPTIONS_INVALID", node(refused).get("code").asText());

        // Go live: the challenge gets assigned to the base.
        assertEquals(HttpStatus.OK, restTemplate.exchange("/api/games/" + game.getId() + "/status", HttpMethod.PATCH,
                new HttpEntity<>(Map.of("status", "live"), op), GameResponse.class).getStatusCode());

        // Player: options without the key, at check-in and in the game data.
        HttpHeaders pl = headersWithAuth(playerAuthHeader(player));
        JsonNode checkIn = node(restTemplate.exchange("/api/player/games/" + game.getId() + "/bases/" + base.getId() + "/check-in",
                HttpMethod.POST, new HttpEntity<>(checkInRequestFor(base), pl), String.class));
        JsonNode options = checkIn.get("challenge").get("options");
        assertEquals(3, options.size());
        assertFalse(options.get(0).has("correct"), "the answer key never reaches a player");
        ResponseEntity<String> data = restTemplate.exchange("/api/player/games/" + game.getId() + "/data", HttpMethod.GET, new HttpEntity<>(pl), String.class);
        assertFalse(data.getBody().contains("\"correct\""));
        assertFalse(data.getBody().contains("choiceOptions"));

        // A partial selection is wrong, without a hint; the full set is right.
        Map<String, Object> wrong = new LinkedHashMap<>();
        wrong.put("baseId", base.getId()); wrong.put("challengeId", challengeId); wrong.put("answer", "");
        wrong.put("selectedOptionIds", List.of(pineId)); wrong.put("idempotencyKey", UUID.randomUUID());
        JsonNode rejected = node(restTemplate.exchange("/api/player/games/" + game.getId() + "/submissions", HttpMethod.POST, new HttpEntity<>(wrong, pl), String.class));
        assertEquals("rejected", rejected.get("status").asText());
        assertEquals("Pine", rejected.get("answer").asText());
        assertFalse(rejected.toString().contains(firId), "a wrong answer does not reveal the other correct option");

        Map<String, Object> right = new LinkedHashMap<>(wrong);
        right.put("selectedOptionIds", List.of(firId, pineId)); right.put("idempotencyKey", UUID.randomUUID());
        JsonNode correct = node(restTemplate.exchange("/api/player/games/" + game.getId() + "/submissions", HttpMethod.POST, new HttpEntity<>(right, pl), String.class));
        assertEquals("correct", correct.get("status").asText());
        assertEquals("Pine; Fir", correct.get("answer").asText());

        Map<String, Object> unknown = new LinkedHashMap<>(wrong);
        unknown.put("selectedOptionIds", List.of("not-an-option")); unknown.put("idempotencyKey", UUID.randomUUID());
        ResponseEntity<String> invalid = restTemplate.exchange("/api/player/games/" + game.getId() + "/submissions", HttpMethod.POST, new HttpEntity<>(unknown, pl), String.class);
        assertEquals(HttpStatus.BAD_REQUEST, invalid.getStatusCode());
        assertEquals("CHOICE_SELECTION_INVALID", node(invalid).get("code").asText());

        // Templates carry the options with their key and ids.
        GameExportDto exported = restTemplate.exchange("/api/games/" + game.getId() + "/export", HttpMethod.GET, new HttpEntity<>(op), GameExportDto.class).getBody();
        assertEquals(3, exported.getChallenges().get(0).getChoiceOptions().size());
        assertEquals(oakId, exported.getChallenges().get(0).getChoiceOptions().get(1).getId());
        ResponseEntity<GameResponse> imported = restTemplate.exchange("/api/games/import", HttpMethod.POST, new HttpEntity<>(Map.of("gameData", exported), op), GameResponse.class);
        assertEquals(HttpStatus.CREATED, imported.getStatusCode());
        JsonNode copy = node(restTemplate.exchange("/api/games/" + imported.getBody().id() + "/challenges", HttpMethod.GET, new HttpEntity<>(op), String.class));
        assertEquals(3, copy.get(0).get("choiceOptions").size());
        assertTrue(copy.get(0).get("choiceOptions").get(0).get("correct").asBoolean());
    }
}
