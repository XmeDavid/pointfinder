package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The phone has always sent accuracy and capturedAt; the server used to throw
 * them away. Operators need accuracy to read the team-position map honestly,
 * and the claim snapshot needs capturedAt to report a fix's real age.
 */
class PlayerLocationFieldsTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private PlayerLocationRepository playerLocationRepository;

    private Player livePlayer(String key) {
        User operator = createOperator("locfield-" + key + "@test.com", "password");
        Game game = createGame(operator, "Loc Field " + key, GameStatus.live);
        Team team = createTeam(game, "Team " + key, ("L" + key + "00001").substring(0, 6));
        return createPlayer(team, "Scout", "device-" + key);
    }

    @Test
    void accuracyAndCapturedAtArePersisted() {
        Player player = livePlayer("a");
        Instant capturedAt = Instant.now().minus(20, ChronoUnit.SECONDS);

        playerService.updateLocation(player.getTeam().getGame().getId(), player,
                41.1, -8.6, 9.5, capturedAt);

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertEquals(9.5, stored.getAccuracyM());
        assertEquals(capturedAt.toEpochMilli(), stored.getCapturedAt().toEpochMilli());
    }

    @Test
    void omittedFieldsStayNullAndDoNotBreakTheUpdate() {
        Player player = livePlayer("b");

        playerService.updateLocation(player.getTeam().getGame().getId(), player, 41.1, -8.6, null, null);

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertNull(stored.getAccuracyM());
        assertNull(stored.getCapturedAt());
        assertEquals(41.1, stored.getLat());
    }

    @Test
    void nonFiniteAccuracyIsDiscardedRatherThanRejected() {
        Player player = livePlayer("c");

        playerService.updateLocation(player.getTeam().getGame().getId(), player,
                41.1, -8.6, Double.NaN, Instant.now());

        PlayerLocation stored = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertNull(stored.getAccuracyM());
    }
}
