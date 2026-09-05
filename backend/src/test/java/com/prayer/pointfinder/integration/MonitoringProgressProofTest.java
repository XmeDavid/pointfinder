package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.TeamBaseProgressResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.service.BroadcastService;
import com.prayer.pointfinder.service.MonitoringService;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The command view reads the check-in proof from the progress rows; the public
 * broadcast reuses the same rows and must not see who stood where.
 */
class MonitoringProgressProofTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private MonitoringService monitoringService;

    @Autowired
    private BroadcastService broadcastService;

    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void operatorRowsCarryTheClaimAndSpectatorRowsDoNot() {
        User operator = createOperator("progressproof@test.com", "password");
        Game game = createGame(operator, "Progress Proof", GameStatus.live);
        game.setBroadcastEnabled(true);
        game.setBroadcastCode("PRF001");
        game = gameRepository.save(game);
        Team team = createTeam(game, "Wolves", "PRF001");
        Player player = createPlayer(team, "Scout", "device-progressproof");
        createPlayer(team, "Mate", "device-progressproof-mate");
        Base base = createBase(game, "Clearing");
        base.setLat(BASE_LAT);
        base.setLng(BASE_LNG);
        base.setCheckInMethod(CheckInMethod.LOCATION);
        base.setCheckInRadiusM(20);
        base = baseRepository.save(base);
        final var baseId = base.getId();

        Instant now = Instant.now();
        List<CheckInRequest.FixDto> dwell = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            CheckInRequest.FixDto fix = new CheckInRequest.FixDto();
            fix.setLat(latOffset(40));
            fix.setLng(BASE_LNG);
            fix.setAccuracy(30.0);
            fix.setCapturedAt(now.minus(100 - i * 30L, ChronoUnit.SECONDS));
            dwell.add(fix);
        }
        CheckInRequest claim = new CheckInRequest();
        claim.setMethod("geo");
        claim.setLat(latOffset(40));
        claim.setLng(BASE_LNG);
        claim.setAccuracy(60.0);
        claim.setCapturedAt(now);
        claim.setClaimed(true);
        claim.setDwell(dwell);
        playerService.checkIn(game.getId(), base.getId(), player, claim);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(operator, null, List.of()));
        TeamBaseProgressResponse row = monitoringService.getProgress(game.getId()).stream()
                .filter(r -> r.baseId().equals(baseId))
                .findFirst().orElseThrow();

        assertEquals("LOCATION", row.checkInMethod());
        assertEquals("CLAIMED", row.verification());
        assertNotNull(row.proofDistanceM());
        assertEquals(60.0, row.proofAccuracyM());
        assertNotNull(row.teamPositionsSnapshot());
        assertEquals(2, row.teamPositionsSnapshot().size());
        assertEquals("Scout", row.teamPositionsSnapshot().get(0).get("displayName"));

        SecurityContextHolder.clearContext();
        TeamBaseProgressResponse spectator = broadcastService.getProgress("PRF001").stream()
                .filter(r -> r.baseId().equals(baseId))
                .findFirst().orElseThrow();
        assertEquals("checked_in", spectator.status());
        assertNull(spectator.checkInMethod());
        assertNull(spectator.verification());
        assertNull(spectator.teamPositionsSnapshot());
    }
}
