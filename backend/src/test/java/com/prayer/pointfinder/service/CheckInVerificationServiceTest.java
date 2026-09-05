package com.prayer.pointfinder.service;

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
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;

/**
 * Rules for the typed check-in proof. Pure unit test: the repositories are
 * only consulted on the CLAIMED path, which has its own test class.
 */
class CheckInVerificationServiceTest {

    private final PlayerRepository playerRepository = mock(PlayerRepository.class);
    private final PlayerLocationRepository playerLocationRepository = mock(PlayerLocationRepository.class);
    private final CheckInVerificationService service =
            new CheckInVerificationService(playerRepository, playerLocationRepository, new ObjectMapper());

    private final Instant now = Instant.parse("2026-09-05T10:00:00Z");

    private Base base(CheckInMethod method) {
        Game game = Game.builder().id(UUID.randomUUID()).build();
        return Base.builder()
                .id(UUID.randomUUID())
                .game(game)
                .name("Base 1")
                .lat(41.1)
                .lng(-8.6)
                .nfcToken("ab12cd34")
                .checkInMethod(method)
                .build();
    }

    private Team team() {
        return Team.builder().id(UUID.randomUUID()).name("Wolves").build();
    }

    private CheckInRequest tokenRequest(String method, String token) {
        CheckInRequest request = new CheckInRequest();
        request.setMethod(method);
        request.setToken(token);
        return request;
    }

    @Test
    void nfcTokenProofVerifiesAtNfcBase() {
        var proof = service.verify(base(CheckInMethod.NFC), team(), tokenRequest("nfc", "ab12cd34"), now);

        assertEquals(CheckInMethod.NFC, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
        assertEquals(now, proof.checkedInAt());
        assertNull(proof.proofLat());
        assertNull(proof.teamPositionsSnapshotJson());
    }

    @Test
    void qrTokenProofVerifiesAtQrBase() {
        var proof = service.verify(base(CheckInMethod.QR), team(), tokenRequest("qr", "ab12cd34"), now);

        assertEquals(CheckInMethod.QR, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
    }

    @Test
    void wrongTokenIsRejectedWithItsOwnCode() {
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("nfc", "zz99zz99"), now));

        assertEquals(ErrorCode.CHECK_IN_TOKEN_INVALID, error.getErrorCode());
    }

    @Test
    void qrProofAtNfcBaseIsAMethodMismatch() {
        BadRequestException error = assertThrows(BadRequestException.class,
                () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("qr", "ab12cd34"), now));

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH, error.getErrorCode());
    }

    @Test
    void legacyBodyIsAcceptedAtNfcBases() {
        CheckInRequest legacy = new CheckInRequest();
        legacy.setNfcToken("ab12cd34");

        var proof = service.verify(base(CheckInMethod.NFC), team(), legacy, now);

        assertEquals(CheckInMethod.NFC, proof.method());
        assertEquals(CheckInVerification.VERIFIED, proof.verification());
    }

    @Test
    void legacyBodyIsRejectedAtNonNfcBases() {
        CheckInRequest legacy = new CheckInRequest();
        legacy.setNfcToken("ab12cd34");

        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.QR), team(), legacy, now)).getErrorCode());
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.LOCATION), team(), legacy, now)).getErrorCode());
    }

    @Test
    void emptyBodyStillReportsTheLegacyMissingTokenCode() {
        assertEquals(ErrorCode.NFC_TOKEN_REQUIRED,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.NFC), team(), new CheckInRequest(), now)).getErrorCode());
    }

    @Test
    void unknownMethodStringIsAMethodMismatch() {
        assertEquals(ErrorCode.CHECK_IN_METHOD_MISMATCH,
                assertThrows(BadRequestException.class,
                        () -> service.verify(base(CheckInMethod.NFC), team(), tokenRequest("beacon", "x"), now))
                        .getErrorCode());
    }

    @Test
    void haversineMatchesAKnownDistance() {
        // One degree of latitude at the equator is ~111.19 km.
        double metres = CheckInVerificationService.haversineMeters(0.0, 0.0, 1.0, 0.0);
        assertEquals(111195.0, metres, 50.0);
    }

    @Test
    void wideRingIsTheLargerOfThreeRadiiAndFiftyMetres() {
        assertEquals(50.0, CheckInVerificationService.wideRingM(10));
        assertEquals(90.0, CheckInVerificationService.wideRingM(30));
    }
}
