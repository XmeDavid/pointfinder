package com.prayer.pointfinder.integration;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.dto.response.CheckInResponse;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckIn;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.Player;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.service.PlayerService;
import com.prayer.pointfinder.service.TeamService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * End-to-end check-in behaviour per base method, through the real service and
 * a real Postgres, including the legacy body and the operator rescue path.
 */
class PlayerCheckInMethodsTest extends IntegrationTestBase {

    @Autowired
    private PlayerService playerService;

    @Autowired
    private TeamService teamService;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private record Ctx(Game game, Team team, Player player, Base base, User operator) {}

    private Ctx ctx(String key, CheckInMethod method, Integer radiusM) {
        User operator = createOperator("method-" + key + "@test.com", "password");
        Game game = createGame(operator, "Method Game " + key, GameStatus.live);
        Team team = createTeam(game, "Wolves " + key, ("W" + key + "00001").substring(0, 6));
        Player player = createPlayer(team, "Scout", "device-" + key);
        Base base = createBase(game, "Base " + key);
        base.setLat(41.100000);
        base.setLng(-8.600000);
        base.setCheckInMethod(method);
        base.setCheckInRadiusM(radiusM);
        base = baseRepository.save(base);
        return new Ctx(game, team, player, base, operator);
    }

    private CheckInRequest token(String method, String value) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod(method);
        request.setToken(value);
        return request;
    }

    private CheckInRequest geo(double lat, double accuracy, Instant capturedAt) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(lat);
        request.setLng(-8.600000);
        request.setAccuracy(accuracy);
        request.setCapturedAt(capturedAt);
        request.setClaimed(false);
        return request;
    }

    @Test
    void qrBaseAcceptsQrTokenAndRecordsTheMethod() {
        Ctx c = ctx("qr", CheckInMethod.QR, null);

        CheckInResponse response = playerService.checkIn(
                c.game().getId(), c.base().getId(), c.player(), token("qr", c.base().getNfcToken()));

        assertEquals("QR", response.method());
        assertEquals("VERIFIED", response.verification());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(CheckInMethod.QR, row.getMethod());
        assertEquals(CheckInVerification.VERIFIED, row.getVerification());
    }

    @Test
    void legacyBodyStillWorksAtNfcBasesAndFailsAtLocationBases() {
        Ctx nfc = ctx("lgn", CheckInMethod.NFC, null);
        CheckInResponse response = playerService.checkIn(
                nfc.game().getId(), nfc.base().getId(), nfc.player(), checkInRequestFor(nfc.base()));
        assertEquals("NFC", response.method());

        Ctx loc = ctx("lgl", CheckInMethod.LOCATION, 20);
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> playerService.checkIn(loc.game().getId(), loc.base().getId(), loc.player(),
                        checkInRequestFor(loc.base())));
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, error.getErrorCode());
    }

    @Test
    void locationBaseAcceptsANearbyFixAndStampsCaptureTime() {
        Ctx c = ctx("geo", CheckInMethod.LOCATION, 20);
        Instant capturedAt = Instant.now().minus(5, ChronoUnit.MINUTES);

        CheckInResponse response = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.100000 + 10.0 / 111_195.0, 8.0, capturedAt));

        assertEquals("LOCATION", response.method());
        assertEquals("VERIFIED", response.verification());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(capturedAt.toEpochMilli(), row.getCheckedInAt().toEpochMilli());
        assertNotNull(row.getProofDistanceM());
        assertEquals(8.0, row.getProofAccuracyM());
    }

    @Test
    void locationBaseRejectsAFixFromFarAway() {
        Ctx c = ctx("far", CheckInMethod.LOCATION, 20);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                        geo(41.200000, 8.0, Instant.now())));

        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, error.getErrorCode());
        assertNotNull(error.getErrors().get("distanceM"));
        assertNotNull(error.getErrors().get("allowedM"));
        assertEquals(List.of(), checkInRepository.findByTeamId(c.team().getId()));
    }

    @Test
    void repeatCheckInIsIdempotentRegardlessOfTheProofSent() {
        Ctx c = ctx("idm", CheckInMethod.LOCATION, 20);
        CheckInResponse first = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.100000, 8.0, Instant.now()));

        // A wildly out-of-range second attempt must return the existing row,
        // not a 400: the team already owns this base.
        CheckInResponse second = playerService.checkIn(c.game().getId(), c.base().getId(), c.player(),
                geo(41.900000, 8.0, Instant.now()));

        assertEquals(first.checkInId(), second.checkInId());
        assertEquals(1, checkInRepository.findByTeamId(c.team().getId()).size());
    }

    @Test
    void operatorRescueIsRecordedAsOperatorVerification() {
        Ctx c = ctx("ops", CheckInMethod.LOCATION, 20);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(c.operator(), null, List.of()));

        CheckInResponse response = teamService.operatorCheckIn(
                c.game().getId(), c.team().getId(), c.base().getId());

        assertEquals("OPERATOR", response.verification());
        assertEquals("LOCATION", response.method());

        CheckIn row = checkInRepository.findByTeamIdAndBaseId(c.team().getId(), c.base().getId()).orElseThrow();
        assertEquals(CheckInVerification.OPERATOR, row.getVerification());
        assertEquals(CheckInMethod.LOCATION, row.getMethod());
    }
}
