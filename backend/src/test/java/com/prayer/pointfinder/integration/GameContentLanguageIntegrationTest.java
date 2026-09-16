package com.prayer.pointfinder.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.export.GameExportDto;
import com.prayer.pointfinder.dto.response.GameResponse;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * OW-33: the organizer declares the language of a game's content. It is
 * normalized, honest about unknown, carried by templates, and shown where an
 * account chooses a game.
 */
class GameContentLanguageIntegrationTest extends IntegrationTestBase {

    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    private <T> ResponseEntity<T> as(User user, HttpMethod method, String path, Object body, Class<T> type) {
        return restTemplate.exchange(path, method, new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(user))), type);
    }

    private JsonNode node(ResponseEntity<String> r) {
        try { return json.readTree(r.getBody()); } catch (Exception e) { throw new RuntimeException(e); }
    }

    @Test
    void languageIsNormalizedValidatedAndClearable() {
        User owner = createOperator("lang-" + UUID.randomUUID() + "@test.com", "Password1");
        Map<String, Object> create = new LinkedHashMap<>();
        create.put("name", "Trilha");
        create.put("contentLanguage", " PT ");
        ResponseEntity<GameResponse> created = as(owner, HttpMethod.POST, "/api/games", create, GameResponse.class);
        assertEquals(HttpStatus.CREATED, created.getStatusCode());
        assertEquals("pt", created.getBody().contentLanguage());
        UUID gameId = created.getBody().id();

        Map<String, Object> update = new LinkedHashMap<>();
        update.put("name", "Trilha");
        update.put("contentLanguage", "por");
        assertEquals(HttpStatus.BAD_REQUEST, as(owner, HttpMethod.PUT, "/api/games/" + gameId, update, String.class).getStatusCode());

        update.put("contentLanguage", "");
        ResponseEntity<GameResponse> cleared = as(owner, HttpMethod.PUT, "/api/games/" + gameId, update, GameResponse.class);
        assertEquals(HttpStatus.OK, cleared.getStatusCode());
        assertNull(cleared.getBody().contentLanguage(), "an empty string clears the language back to unknown");

        // A game created without saying anything is unknown, not a guessed default.
        ResponseEntity<GameResponse> silent = as(owner, HttpMethod.POST, "/api/games", Map.of("name", "Quiet"), GameResponse.class);
        assertNull(silent.getBody().contentLanguage());
    }

    @Test
    void templatesCarryTheLanguageAndImportUnusableCodesAsUnknown() {
        User owner = createOperator("lang-tpl-" + UUID.randomUUID() + "@test.com", "Password1");
        Game source = createGame(owner, "Waldspiel", GameStatus.setup);
        source.setContentLanguage("de");
        gameRepository.save(source);

        GameExportDto exported = as(owner, HttpMethod.GET, "/api/games/" + source.getId() + "/export", null, GameExportDto.class).getBody();
        assertEquals("de", exported.getGame().getContentLanguage());

        ResponseEntity<GameResponse> imported = as(owner, HttpMethod.POST, "/api/games/import", Map.of("gameData", exported), GameResponse.class);
        assertEquals(HttpStatus.CREATED, imported.getStatusCode());
        assertEquals("de", imported.getBody().contentLanguage());

        exported.getGame().setContentLanguage("deutsch");
        ResponseEntity<GameResponse> lenient = as(owner, HttpMethod.POST, "/api/games/import", Map.of("gameData", exported), GameResponse.class);
        assertEquals(HttpStatus.CREATED, lenient.getStatusCode());
        assertNull(lenient.getBody().contentLanguage(), "a template with an unusable code imports as unknown");
    }

    @Test
    void discoveryAndTheJoinResponseShowTheLanguage() {
        User owner = createOperator("lang-disc-" + UUID.randomUUID() + "@test.com", "Password1");
        Game game = createGame(owner, "Costa", GameStatus.live);
        game.setContentLanguage("pt");
        gameRepository.save(game);
        Team team = createTeam(game, "Gaivotas", "GAIV" + UUID.randomUUID().toString().substring(0, 4).toUpperCase());

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("title", "Costa");
        summary.put("summary", "Uma trilha pela costa.");
        summary.put("place", "Costa de Lavos");
        summary.put("category", "coast");
        summary.put("admissionTeamId", team.getId());
        assertEquals(HttpStatus.OK, as(owner, HttpMethod.PUT, "/api/games/" + game.getId() + "/publication", summary, String.class).getStatusCode());
        assertEquals(HttpStatus.OK, as(owner, HttpMethod.POST, "/api/games/" + game.getId() + "/publication/publish", null, String.class).getStatusCode());

        JsonNode publication = node(as(owner, HttpMethod.GET, "/api/games/" + game.getId() + "/publication", null, String.class));
        assertEquals("pt", publication.get("contentLanguage").asText());

        JsonNode explore = node(as(owner, HttpMethod.GET, "/api/explore/games?q=Costa", null, String.class));
        assertTrue(explore.get("items").size() >= 1);
        JsonNode mine = null;
        for (JsonNode item : explore.get("items")) if (item.get("gameId").asText().equals(game.getId().toString())) mine = item;
        assertEquals("pt", mine.get("contentLanguage").asText());

        Map<String, Object> join = new LinkedHashMap<>();
        join.put("joinCode", team.getJoinCode());
        join.put("displayName", "Rita");
        join.put("deviceId", "lang-device-" + UUID.randomUUID());
        JsonNode joined = node(restTemplate.postForEntity("/api/auth/player/join", join, String.class));
        assertEquals("pt", joined.get("game").get("contentLanguage").asText());
    }
}
