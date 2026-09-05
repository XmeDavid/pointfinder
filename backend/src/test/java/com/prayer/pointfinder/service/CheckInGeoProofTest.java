package com.prayer.pointfinder.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.prayer.pointfinder.dto.request.CheckInRequest;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.CheckInVerification;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.Team;
import com.prayer.pointfinder.exception.BadRequestException;
import com.prayer.pointfinder.exception.ErrorCode;
import com.prayer.pointfinder.repository.PlayerLocationRepository;
import com.prayer.pointfinder.repository.PlayerRepository;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/**
 * Automatic ("the GPS confirmed it") geo proof. Accepts when
 * {@code distance <= radius + min(accuracy, 30)}; the row is VERIFIED and is
 * stamped with the moment the phone captured the fix, not receipt time, so an
 * offline replay does not backdate or postdate the arrival.
 */
class CheckInGeoProofTest {

    private final CheckInVerificationService service = new CheckInVerificationService(
            mock(PlayerRepository.class), mock(PlayerLocationRepository.class), new ObjectMapper());

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");
    private static final double BASE_LAT = 41.100000;
    private static final double BASE_LNG = -8.600000;

    private Base locationBase(Integer radiusOverride, int gameDefaultRadius) {
        Game game = Game.builder().id(UUID.randomUUID()).defaultCheckInRadiusM(gameDefaultRadius).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Meadow")
                .lat(BASE_LAT)
                .lng(BASE_LNG)
                .nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.LOCATION)
                .checkInRadiusM(radiusOverride)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    /** Offsets a latitude by roughly {@code metres} to the north. */
    private static double latOffset(double metres) {
        return BASE_LAT + metres / 111_195.0;
    }

    private CheckInRequest geo(double lat, double accuracy, Instant capturedAt) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod("geo");
        request.setLat(lat);
        request.setLng(BASE_LNG);
        request.setAccuracy(accuracy);
        request.setCapturedAt(capturedAt);
        request.setClaimed(false);
        return request;
    }

    @Test
    void fixInsideTheRadiusIsVerifiedAndStampedWithCaptureTime() {
        Instant capturedAt = now.minus(3, ChronoUnit.MINUTES);
        var proof = service.verify(locationBase(20, 15), team(), geo(latOffset(10), 8.0, capturedAt), now);

        assertEquals(CheckInMethod.LOCATION, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
        assertEquals(capturedAt, proof.checkedInAt());
        assertEquals(capturedAt, proof.proofCapturedAt());
        assertEquals(8.0, proof.proofAccuracyM());
        assertTrue(proof.proofDistanceM() > 9.0 && proof.proofDistanceM() < 11.0);
    }

    @Test
    void accuracyCreditExtendsTheRadiusButIsCappedAtThirtyMetres() {
        // radius 20 + min(45, 30) = 50 m allowed.
        var accepted = service.verify(locationBase(20, 15), team(), geo(latOffset(48), 45.0, now), now);
        assertEquals(CheckInVerification.VERIFIED, accepted.verification());

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(60), 45.0, now), now));
        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, error.getErrorCode());
        assertEquals("50", error.getErrors().get("allowedM"));
        assertEquals("60", error.getErrors().get("distanceM"));
    }

    @Test
    void gameDefaultRadiusAppliesWhenTheBaseHasNoOverride() {
        // Game default 40 + min(5, 30) = 45 m allowed.
        var proof = service.verify(locationBase(null, 40), team(), geo(latOffset(43), 5.0, now), now);
        assertEquals(CheckInVerification.VERIFIED, proof.verification());

        assertEquals(ErrorCode.CHECK_IN_OUT_OF_RANGE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(null, 40), team(), geo(latOffset(60), 5.0, now), now))
                .getErrorCode());
    }

    @Test
    void accuracyWorseThanFiftyMetresIsRejected() {
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(1), 51.0, now), now))
                .getErrorCode());
    }

    @Test
    void missingOrNonFiniteAccuracyIsRejected() {
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(1), Double.NaN, now), now))
                .getErrorCode());

        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), geo(latOffset(1), 0.0, now), now))
                .getErrorCode());

        CheckInRequest noAccuracy = geo(latOffset(1), 5.0, now);
        noAccuracy.setAccuracy(null);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), noAccuracy, now)).getErrorCode());
    }

    @Test
    void fixesOlderThanADayOrMoreThanTenMinutesAheadAreStale() {
        assertEquals(ErrorCode.CHECK_IN_FIX_STALE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(),
                        geo(latOffset(1), 5.0, now.minus(25, ChronoUnit.HOURS)), now)).getErrorCode());

        assertEquals(ErrorCode.CHECK_IN_FIX_STALE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(),
                        geo(latOffset(1), 5.0, now.plus(11, ChronoUnit.MINUTES)), now)).getErrorCode());

        // Just inside both edges.
        assertEquals(CheckInVerification.VERIFIED, service.verify(locationBase(20, 15), team(),
                geo(latOffset(1), 5.0, now.minus(23, ChronoUnit.HOURS)), now).verification());
        assertEquals(CheckInVerification.VERIFIED, service.verify(locationBase(20, 15), team(),
                geo(latOffset(1), 5.0, now.plus(9, ChronoUnit.MINUTES)), now).verification());
    }

    @Test
    void missingOrNonFiniteCoordinatesAreRejected() {
        CheckInRequest noLat = geo(latOffset(1), 5.0, now);
        noLat.setLat(null);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), noLat, now)).getErrorCode());

        CheckInRequest infiniteLng = geo(latOffset(1), 5.0, now);
        infiniteLng.setLng(Double.POSITIVE_INFINITY);
        assertEquals(ErrorCode.CHECK_IN_FIX_TOO_COARSE, assertThrows(BadRequestException.class,
                () -> service.verify(locationBase(20, 15), team(), infiniteLng, now)).getErrorCode());
    }

    @Test
    void geoProofAtAnNfcBaseIsAMethodMismatch() {
        Base nfcBase = Base.builder()
                .id(UUID.randomUUID())
                .game(Game.builder().id(UUID.randomUUID()).build())
                .lat(BASE_LAT).lng(BASE_LNG).nfcToken("ab12cd34")
                .checkInMethod(CheckInMethod.NFC)
                .build();

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, assertThrows(BadRequestException.class,
                () -> service.verify(nfcBase, team(), geo(latOffset(1), 5.0, now), now)).getErrorCode());
    }
}
