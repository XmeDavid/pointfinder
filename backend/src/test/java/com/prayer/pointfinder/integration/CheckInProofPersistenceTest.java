package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.ActivityEvent;
import com.prayer.pointfinder.entity.ActivityEventType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.repository.ActivityEventRepository;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Round-trips the new columns through Hibernate so the JSON mappings and the
 * enum-as-varchar mappings are exercised against real Postgres, not just the
 * schema assertions in {@link CheckInMethodsSchemaTest}.
 */
class CheckInProofPersistenceTest extends IntegrationTestBase {

    @Autowired
    private PlayerLocationRepository playerLocationRepository;

    @Autowired
    private ActivityEventRepository activityEventRepository;

    @Autowired
    private TransactionTemplate transactionTemplate;

    @Test
    void claimedCheckInRoundTripsProofAndSnapshot() {
        User operator = createOperator("proof@checkin.com", "password");
        Game game = createGame(operator, "Proof Game", GameStatus.live);
        Team team = createTeam(game, "Otters", "OTT001");
        Base base = createBase(game, "Proof Base");
        Player player = createPlayer(team, "Scout", "device-proof");

        Instant capturedAt = Instant.parse("2026-09-05T10:00:00Z");
        CheckIn saved = checkInRepository.save(CheckIn.builder()
                .game(game)
                .team(team)
                .base(base)
                .player(player)
                .checkedInAt(Instant.parse("2026-09-05T10:00:30Z"))
                .method(CheckInMethod.LOCATION)
                .verification(CheckInVerification.CLAIMED)
                .proofLat(41.1)
                .proofLng(-8.6)
                .proofAccuracyM(22.0)
                .proofDistanceM(38.5)
                .proofCapturedAt(capturedAt)
                .teamPositionsSnapshot("[{\"playerId\":\"p1\",\"distanceM\":12.5}]")
                .sourceSurface("player_app")
                .build());

        CheckIn reloaded = checkInRepository.findById(saved.getId()).orElseThrow();
        assertEquals(CheckInMethod.LOCATION, reloaded.getMethod());
        assertEquals(CheckInVerification.CLAIMED, reloaded.getVerification());
        assertEquals(41.1, reloaded.getProofLat());
        assertEquals(-8.6, reloaded.getProofLng());
        assertEquals(22.0, reloaded.getProofAccuracyM());
        assertEquals(38.5, reloaded.getProofDistanceM());
        assertEquals(capturedAt, reloaded.getProofCapturedAt());
        assertTrue(reloaded.getTeamPositionsSnapshot().contains("distanceM"));
    }

    @Test
    void playerLocationStoresAccuracyAndCaptureTime() {
        User operator = createOperator("loc@checkin.com", "password");
        Game game = createGame(operator, "Loc Game", GameStatus.live);
        Team team = createTeam(game, "Badgers", "BDG001");
        Player player = createPlayer(team, "Scout", "device-loc");

        Instant capturedAt = Instant.parse("2026-09-05T09:59:00Z");
        // A @MapsId one-to-one needs a managed owner, exactly as the service
        // path has inside its transaction; reload the player there.
        transactionTemplate.executeWithoutResult(status -> {
            Player managed = playerRepository.findById(player.getId()).orElseThrow();
            playerLocationRepository.save(PlayerLocation.builder()
                    .player(managed)
                    .lat(41.0)
                    .lng(-8.5)
                    .accuracyM(9.5)
                    .capturedAt(capturedAt)
                    .build());
        });

        PlayerLocation reloaded = playerLocationRepository.findById(player.getId()).orElseThrow();
        assertEquals(9.5, reloaded.getAccuracyM());
        assertEquals(capturedAt, reloaded.getCapturedAt());
    }

    @Test
    void activityEventStoresStructuredMetadata() {
        User operator = createOperator("meta@checkin.com", "password");
        Game game = createGame(operator, "Meta Game", GameStatus.live);
        Team team = createTeam(game, "Foxes", "FOX001");
        Base base = createBase(game, "Meta Base");

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("method", "LOCATION");
        metadata.put("verification", "CLAIMED");
        metadata.put("teammatesInRing", 2);
        metadata.put("teammatesTotal", 4);

        ActivityEvent saved = activityEventRepository.save(ActivityEvent.builder()
                .game(game)
                .type(ActivityEventType.check_in)
                .team(team)
                .base(base)
                .message("Foxes checked in at Meta Base")
                .timestamp(Instant.now())
                .metadata(metadata)
                .build());

        ActivityEvent reloaded = activityEventRepository.findById(saved.getId()).orElseThrow();
        assertEquals("CLAIMED", reloaded.getMetadata().get("verification"));
        assertEquals(2, ((Number) reloaded.getMetadata().get("teammatesInRing")).intValue());
    }
}
