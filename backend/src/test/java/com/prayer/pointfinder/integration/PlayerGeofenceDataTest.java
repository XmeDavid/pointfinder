package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.response.GameDataResponse;
import com.prayer.pointfinder.dto.response.PlayerBaseResponse;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Challenge;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Hidden location bases have to reach the phone or arrival detection cannot
 * work offline — but only as bare geometry. A hidden NFC or QR base still
 * stays invisible, because there is nothing to detect until the player is
 * standing at the tag anyway.
 */
class PlayerGeofenceDataTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    private Base base(Game game, String name, CheckInMethod method, boolean hidden, Integer radiusM) {
        Base b = createBase(game, name);
        b.setCheckInMethod(method);
        b.setHidden(hidden);
        b.setCheckInRadiusM(radiusM);
        return baseRepository.save(b);
    }

    @Test
    void hiddenLocationBasesAreSentAsGeofenceOnlyRows() {
        User operator = createOperator("geofence@test.com", "password");
        Game game = createGame(operator, "Geofence Game", GameStatus.live);
        game.setDefaultCheckInRadiusM(25);
        game = gameRepository.save(game);
        Team team = createTeam(game, "Wolves", "GEO001");
        Player player = createPlayer(team, "Scout", "device-geofence");

        Base visible = base(game, "Visible", CheckInMethod.NFC, false, null);
        Base hiddenLocation = base(game, "Secret Clearing", CheckInMethod.LOCATION, true, 60);
        Base hiddenNfc = base(game, "Secret Tag", CheckInMethod.NFC, true, null);
        Challenge challenge = createChallenge(game, "C1", AnswerType.text, 10);
        visible.setFixedChallenge(challenge);
        baseRepository.save(visible);

        GameDataResponse data = playerService.getGameData(game.getId(), player);

        Optional<PlayerBaseResponse> geofence = data.bases().stream()
                .filter(b -> b.id().equals(hiddenLocation.getId())).findFirst();
        assertTrue(geofence.isPresent(), "hidden LOCATION base must be sent as a geofence");
        assertEquals("LOCATION", geofence.get().checkInMethod());
        assertEquals(60, geofence.get().checkInRadiusM());
        assertEquals(Boolean.TRUE, geofence.get().hidden());
        assertEquals(Boolean.FALSE, geofence.get().nfcLinked());
        assertNull(geofence.get().fixedChallengeId());

        assertFalse(data.bases().stream().anyMatch(b -> b.id().equals(hiddenNfc.getId())),
                "hidden NFC bases stay invisible");
    }

    @Test
    void visitedHiddenLocationBasesAreNotResentAsGeofences() {
        User operator = createOperator("geofence2@test.com", "password");
        Game game = createGame(operator, "Geofence Game 2", GameStatus.live);
        Team team = createTeam(game, "Otters", "GEO002");
        Player player = createPlayer(team, "Scout", "device-geofence2");
        createChallenge(game, "C1", AnswerType.text, 10);
        Base hiddenLocation = base(game, "Found Clearing", CheckInMethod.LOCATION, true, 30);

        checkInRepository.save(CheckIn.builder()
                .game(game).team(team).base(hiddenLocation).player(player)
                .checkedInAt(Instant.now()).sourceSurface("player_app").build());

        GameDataResponse data = playerService.getGameData(game.getId(), player);

        // The progress row carries the visited base to the phone; the geofence
        // pass must not add a second, geometry-only copy on top of whatever the
        // regular base list sends.
        long copies = data.bases().stream().filter(b -> b.id().equals(hiddenLocation.getId())).count();
        assertTrue(copies <= 1, "a visited hidden base must not be duplicated by the geofence pass");
        assertFalse(data.bases().stream().anyMatch(b -> b.id().equals(hiddenLocation.getId())
                && b.fixedChallengeId() == null && Boolean.TRUE.equals(b.hidden())
                && "LOCATION".equals(b.checkInMethod()) && Boolean.FALSE.equals(b.nfcLinked())
                && data.progress().stream().anyMatch(p -> p.baseId().equals(hiddenLocation.getId()))
                && copies > 1), "no geofence-only row for an already-visited base");
    }

    @Test
    void visibleBasesCarryTheResolvedMethodAndRadius() {
        User operator = createOperator("resolved@test.com", "password");
        Game game = createGame(operator, "Resolved Game", GameStatus.live);
        game.setDefaultCheckInRadiusM(25);
        game = gameRepository.save(game);
        Team team = createTeam(game, "Badgers", "RES001");
        Player player = createPlayer(team, "Scout", "device-resolved");
        Base inherits = base(game, "Inherits", CheckInMethod.LOCATION, false, null);
        Base overrides = base(game, "Overrides", CheckInMethod.LOCATION, false, 80);

        var bases = playerService.getBases(game.getId(), player);

        assertEquals(25, bases.stream().filter(b -> b.id().equals(inherits.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
        assertEquals(80, bases.stream().filter(b -> b.id().equals(overrides.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
        assertEquals("LOCATION", bases.get(0).checkInMethod());

        // The progress rows the logbook renders from carry the same resolution.
        var progress = playerService.getProgress(game.getId(), player);
        assertEquals("LOCATION", progress.stream().filter(p -> p.baseId().equals(inherits.getId()))
                .findFirst().orElseThrow().checkInMethod());
        assertEquals(25, progress.stream().filter(p -> p.baseId().equals(inherits.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
        assertEquals(80, progress.stream().filter(p -> p.baseId().equals(overrides.getId()))
                .findFirst().orElseThrow().checkInRadiusM());
    }
}
