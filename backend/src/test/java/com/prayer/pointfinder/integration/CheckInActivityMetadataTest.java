package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.service.PlayerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The operator feed has to distinguish "walked in and the GPS agreed" from
 * "pressed I'm here", and for a claim it has to say how much of the team was
 * actually nearby — otherwise the badge is an accusation with no evidence.
 */
class CheckInActivityMetadataTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    private record Ctx(Game game, Team team, Player player, Base base) {}

    private Ctx ctx(String key, CheckInMethod method) {
        User operator = createOperator("actmeta-" + key + "@test.com", "password");
        Game game = createGame(operator, "Act Meta " + key, GameStatus.live);
        Team team = createTeam(game, "Wolves " + key, ("A" + key + "00001").substring(0, 6));
        Player player = createPlayer(team, "Scout", "device-actmeta-" + key);
        Base base = createBase(game, "Base " + key);
        base.setLat(BASE_LAT);
        base.setLng(BASE_LNG);
        base.setCheckInMethod(method);
        base.setCheckInRadiusM(20);
        base = baseRepository.save(base);
        return new Ctx(game, team, player, base);
    }

    private ActivityEvent onlyEvent(Ctx c) {
        List<ActivityEvent> events = activityEventRepository.findByGameIdIncludingArchived(c.game().getId());
        assertEquals(1, events.size());
        return events.get(0);
    }

    @Test
    void verifiedGeoCheckInRecordsMethodAndVerification() {
        Ctx c = ctx("v", CheckInMethod.LOCATION);
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(5));
        request.setLng(BASE_LNG);
        request.setAccuracy(6.0);
        request.setCapturedAt(Instant.now());
        request.setClaimed(false);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), request);

        ActivityEvent event = onlyEvent(c);
        assertEquals("LOCATION", event.getMetadata().get("method"));
        assertEquals("VERIFIED", event.getMetadata().get("verification"));
        assertNull(event.getMetadata().get("teammatesInRing"));
    }

    @Test
    void claimedCheckInReportsHowManyTeammatesWereInTheRing() {
        Ctx c = ctx("c", CheckInMethod.LOCATION);
        // A second teammate with no known position: total 2, none in the ring.
        createPlayer(c.team(), "Mate", "device-actmeta-mate");

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
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(40));
        request.setLng(BASE_LNG);
        request.setAccuracy(60.0);
        request.setCapturedAt(now);
        request.setClaimed(true);
        request.setDwell(dwell);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), request);

        ActivityEvent event = onlyEvent(c);
        assertEquals("CLAIMED", event.getMetadata().get("verification"));
        assertEquals(0, ((Number) event.getMetadata().get("teammatesInRing")).intValue());
        assertEquals(2, ((Number) event.getMetadata().get("teammatesTotal")).intValue());
        assertNotNull(checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId())
                .orElseThrow().getTeamPositionsSnapshot());
    }

    @Test
    void nfcCheckInStillRecordsItsMethod() {
        Ctx c = ctx("n", CheckInMethod.NFC);

        playerService.checkIn(c.game().getId(), c.base().getId(), c.player(), checkInRequestFor(c.base()));

        ActivityEvent event = onlyEvent(c);
        assertEquals("NFC", event.getMetadata().get("method"));
        assertEquals("VERIFIED", event.getMetadata().get("verification"));
    }
}
