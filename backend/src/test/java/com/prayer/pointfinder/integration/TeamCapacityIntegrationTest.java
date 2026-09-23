package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.PlayerJoinRequest;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.PlayerJoinRateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * OW-05 first slice: an optional per-team player limit. It refuses new
 * participations once the team is full (TEAM_FULL), never removes or blocks
 * players already on the team, does not count retired guest rows, and survives
 * updates from clients that do not know the field.
 */
class TeamCapacityIntegrationTest extends IntegrationTestBase {

    @Autowired
    private PlayerJoinRateLimiter rateLimiter;

    private User operator;
    private Game game;
    private Team team;

    @BeforeEach
    void setUp() {
        rateLimiter.clear();
        String key = UUID.randomUUID().toString().substring(0, 8);
        operator = createOperator("capacity-" + key + "@test.com", "Password1");
        game = createGame(operator, "Capacity " + key, GameStatus.live);
        team = createTeam(game, "Falcons", ("CAP" + key).substring(0, 8).toUpperCase());
    }

    private ResponseEntity<Map> updateTeam(Map<String, Object> body) {
        return restTemplate.exchange("/api/games/" + game.getId() + "/teams/" + team.getId(), HttpMethod.PUT,
                new HttpEntity<>(body, headersWithAuth(operatorAuthHeader(operator))), Map.class);
    }

    private ResponseEntity<Map> join(String deviceId) {
        PlayerJoinRequest join = new PlayerJoinRequest();
        join.setJoinCode(team.getJoinCode());
        join.setDisplayName("Scout " + deviceId);
        join.setDeviceId(deviceId);
        return restTemplate.postForEntity("/api/auth/player/join", join, Map.class);
    }

    @Test
    void aFullTeamRefusesNewPlayersButKeepsItsMembers() {
        Map<String, Object> limit = new HashMap<>();
        limit.put("name", "Falcons");
        limit.put("maxPlayers", 2);
        ResponseEntity<Map> updated = updateTeam(limit);
        assertEquals(HttpStatus.OK, updated.getStatusCode());
        assertEquals(2, updated.getBody().get("maxPlayers"));

        assertEquals(HttpStatus.OK, join("cap-dev-1").getStatusCode());
        assertEquals(HttpStatus.OK, join("cap-dev-2").getStatusCode());
        ResponseEntity<Map> refused = join("cap-dev-3");
        assertEquals(HttpStatus.BAD_REQUEST, refused.getStatusCode());
        assertEquals("TEAM_FULL", refused.getBody().get("code"));
        // A member coming back on the same phone is not a new player.
        assertEquals(HttpStatus.OK, join("cap-dev-1").getStatusCode());
    }

    @Test
    void retiredGuestRowsDoNotTakeASeat() {
        createPlayer(team, "Old guest", "retired:old-phone");
        Map<String, Object> limit = new HashMap<>();
        limit.put("name", "Falcons");
        limit.put("maxPlayers", 1);
        assertEquals(HttpStatus.OK, updateTeam(limit).getStatusCode());
        assertEquals(HttpStatus.OK, join("cap-dev-new").getStatusCode());
    }

    @Test
    void anUpdateWithoutTheFieldKeepsTheLimitAndAnExplicitClearRemovesIt() {
        Map<String, Object> limit = new HashMap<>();
        limit.put("name", "Falcons");
        limit.put("maxPlayers", 1);
        assertEquals(HttpStatus.OK, updateTeam(limit).getStatusCode());

        // Older clients rename a team with name and color only.
        Map<String, Object> rename = Map.of("name", "Falcons II", "color", "#123456");
        assertEquals(1, updateTeam(rename).getBody().get("maxPlayers"));

        assertEquals(HttpStatus.OK, join("cap-clear-1").getStatusCode());
        assertEquals("TEAM_FULL", join("cap-clear-2").getBody().get("code"));

        Map<String, Object> clear = new HashMap<>();
        clear.put("name", "Falcons II");
        clear.put("clearMaxPlayers", true);
        assertNull(updateTeam(clear).getBody().get("maxPlayers"));
        assertEquals(HttpStatus.OK, join("cap-clear-2").getStatusCode());
    }

    @Test
    void limitsOutsideTheSupportedRangeAreRefused() {
        Map<String, Object> zero = new HashMap<>();
        zero.put("name", "Falcons");
        zero.put("maxPlayers", 0);
        assertEquals(HttpStatus.BAD_REQUEST, updateTeam(zero).getStatusCode());
    }
}
