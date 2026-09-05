package com.prayer.pointfinder.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.PlayerLocation;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The "I'm here" escape hatch. The claim is always accepted into the game —
 * a team stuck under tree cover must not be stranded — but it is recorded as
 * CLAIMED and carries a snapshot of where every teammate's phone last was, so
 * an operator can see afterwards whether the team was really there.
 */
class CheckInClaimProofTest {

    private final PlayerRepository playerRepository = mock(PlayerRepository.class);
    private final PlayerLocationRepository playerLocationRepository = mock(PlayerLocationRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final CheckInVerificationService service =
            new CheckInVerificationService(playerRepository, playerLocationRepository, objectMapper);

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");
    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    /** radius 20 → wide ring max(60, 50) = 60 m. */
    private Base locationBase() {
        Game game = Game.builder().id(UUID.randomUUID()).defaultCheckInRadiusM(15).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Meadow")
                .lat(BASE_LAT)
                .lng(BASE_LNG)
                .nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.LOCATION)
                .checkInRadiusM(20)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    private CheckInRequest.FixDto fix(double metresFromBase, double accuracy, Instant capturedAt) {
        CheckInRequest.FixDto dto = new CheckInRequest.FixDto();
        dto.setLat(latOffset(metresFromBase));
        dto.setLng(BASE_LNG);
        dto.setAccuracy(accuracy);
        dto.setCapturedAt(capturedAt);
        return dto;
    }

    /** Four samples spanning 90 s, all 40 m out, ending 10 s before the main fix. */
    private List<CheckInRequest.FixDto> goodBuffer() {
        List<CheckInRequest.FixDto> buffer = new ArrayList<>();
        buffer.add(fix(40, 30.0, now.minus(100, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(70, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(40, ChronoUnit.SECONDS)));
        buffer.add(fix(40, 30.0, now.minus(10, ChronoUnit.SECONDS)));
        return buffer;
    }

    private CheckInRequest claim(double metresFromBase, double accuracy, List<CheckInRequest.FixDto> dwell) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(latOffset(metresFromBase));
        request.setLng(BASE_LNG);
        request.setAccuracy(accuracy);
        request.setCapturedAt(now);
        request.setClaimed(true);
        request.setDwell(dwell);
        return request;
    }

    private void stubTeam(Team team, Player... players) {
        when(playerRepository.findByTeamId(team.getId())).thenReturn(List.of(players));
    }

    private Player player(Team team, String name) {
        return Player.builder().id(UUID.randomUUID()).team(team).displayName(name).build();
    }

    @Test
    void validClaimIsAcceptedAsClaimedWithTeammateSnapshot() throws Exception {
        Team team = team();
        Player near = player(team, "Ana");
        Player far = player(team, "Bruno");
        stubTeam(team, near, far);
        when(playerLocationRepository.findById(near.getId())).thenReturn(Optional.of(PlayerLocation.builder()
                .player(near).lat(latOffset(30)).lng(BASE_LNG).accuracyM(12.0)
                .capturedAt(now.minus(30, ChronoUnit.SECONDS)).build()));
        when(playerLocationRepository.findById(far.getId())).thenReturn(Optional.of(PlayerLocation.builder()
                .player(far).lat(latOffset(500)).lng(BASE_LNG).accuracyM(9.0)
                .capturedAt(now.minus(60, ChronoUnit.SECONDS)).build()));

        var proof = service.verify(locationBase(), team, claim(40, 60.0, goodBuffer()), now);

        assertEquals(CheckInMethod.LOCATION, proof.method());
        assertEquals(CheckInVerification.CLAIMED, proof.verification());
        assertEquals(now, proof.checkedInAt());
        assertEquals(1, proof.teammatesInRing());
        assertEquals(2, proof.teammatesTotal());

        JsonNode snapshot = objectMapper.readTree(proof.teamPositionsSnapshotJson());
        assertEquals(2, snapshot.size());
        assertEquals("Ana", snapshot.get(0).get("displayName").asText());
        assertTrue(snapshot.get(0).get("distanceM").asDouble() > 25.0);
        assertEquals(30, snapshot.get(0).get("ageSeconds").asInt());
        assertEquals(12.0, snapshot.get(0).get("accuracyM").asDouble());
    }

    @Test
    void teammatesWithNoKnownPositionStillAppearInTheSnapshot() throws Exception {
        Team team = team();
        Player unknown = player(team, "Carla");
        stubTeam(team, unknown);
        when(playerLocationRepository.findById(any())).thenReturn(Optional.empty());

        var proof = service.verify(locationBase(), team, claim(40, 60.0, goodBuffer()), now);

        JsonNode snapshot = objectMapper.readTree(proof.teamPositionsSnapshotJson());
        assertEquals(1, snapshot.size());
        assertTrue(snapshot.get(0).get("lat").isNull());
        assertTrue(snapshot.get(0).get("distanceM").isNull());
        assertEquals(0, proof.teammatesInRing());
        assertEquals(1, proof.teammatesTotal());
    }

    @Test
    void mainFixOutsideTheWideRingIsRejected() {
        Team team = team();
        stubTeam(team);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(80, 60.0, goodBuffer()), now));

        assertEquals(ErrorCode.CHECK_IN_CLAIM_NOT_DWELLED, error.getErrorCode());
        assertEquals("outside_ring", error.getErrors().get("reason"));
    }

    @Test
    void fewerThanFourDwellFixesIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> short3 = new ArrayList<>(goodBuffer().subList(0, 3));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, short3), now));

        assertEquals("too_few_fixes", error.getErrors().get("reason"));
    }

    @Test
    void missingDwellBufferIsRejected() {
        Team team = team();
        stubTeam(team);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, null), now));

        assertEquals("too_few_fixes", error.getErrors().get("reason"));
    }

    @Test
    void bufferSpanningLessThanAMinuteIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> tight = List.of(
                fix(40, 30.0, now.minus(40, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(30, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(20, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(10, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, tight), now));

        assertEquals("span_too_short", error.getErrors().get("reason"));
    }

    @Test
    void aDwellFixOutsideTheRingIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> wandering = new ArrayList<>(goodBuffer());
        wandering.set(1, fix(400, 30.0, now.minus(70, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, wandering), now));

        assertEquals("outside_ring", error.getErrors().get("reason"));
    }

    @Test
    void aDwellFixWorseThanAHundredMetresIsRejected() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> coarse = new ArrayList<>(goodBuffer());
        coarse.set(2, fix(40, 140.0, now.minus(40, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, coarse), now));

        assertEquals("fix_too_coarse", error.getErrors().get("reason"));
    }

    @Test
    void aBufferThatEndedMoreThanTwoMinutesBeforeTheClaimIsStale() {
        Team team = team();
        stubTeam(team);
        List<CheckInRequest.FixDto> old = List.of(
                fix(40, 30.0, now.minus(400, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(370, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(340, ChronoUnit.SECONDS)),
                fix(40, 30.0, now.minus(300, ChronoUnit.SECONDS)));

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 60.0, old), now));

        assertEquals("buffer_stale", error.getErrors().get("reason"));
    }

    @Test
    void mainClaimFixWorseThanAHundredMetresIsTooCoarse() {
        Team team = team();
        stubTeam(team);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(), team, claim(40, 110.0, goodBuffer()), now)).getErrorCode());
    }
}
