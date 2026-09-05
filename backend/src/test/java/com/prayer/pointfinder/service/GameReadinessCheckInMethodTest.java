package com.prayer.pointfinder.service;

import com.prayer.pointfinder.IntegrationTestBase;
import com.prayer.pointfinder.entity.AnswerType;
import com.prayer.pointfinder.entity.Base;
import com.prayer.pointfinder.entity.CheckInMethod;
import com.prayer.pointfinder.entity.Game;
import com.prayer.pointfinder.entity.GameStatus;
import com.prayer.pointfinder.entity.User;
import com.prayer.pointfinder.exception.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Go-live rules per check-in method. NFC bases still need a linked tag; QR
 * bases need nothing (the code is printed from the same token); location
 * bases need real coordinates, a sane radius, and rings that do not overlap —
 * two overlapping rings would let one arrival unlock two bases at once.
 */
class GameReadinessCheckInMethodTest extends IntegrationTestBase {

    @Autowired
    private GameReadinessValidator validator;

    private Game gameWithTeamAndChallenges(String key, int challengeCount) {
        User operator = createOperator("readiness-" + key + "@test.com", "password");
        Game game = createGame(operator, "Readiness " + key, GameStatus.setup);
        createTeam(game, "Team " + key, ("R" + key + "00001").substring(0, 6));
        for (int i = 0; i < challengeCount; i++) {
            createChallenge(game, "Challenge " + key + i, AnswerType.text, 10);
        }
        return game;
    }

    private Base base(Game game, String name, CheckInMethod method, boolean nfcLinked,
                      double lat, double lng, Integer radiusM) {
        Base b = Base.builder()
                .game(game)
                .name(name)
                .description("")
                .lat(lat)
                .lng(lng)
                .nfcLinked(nfcLinked)
                .checkInMethod(method)
                .checkInRadiusM(radiusM)
                .build();
        return baseRepository.save(b);
    }

    @Test
    void qrBasesNeedNoTagLink() {
        Game game = gameWithTeamAndChallenges("qr", 1);
        base(game, "Kiosk", CheckInMethod.QR, false, 41.1, -8.6, null);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }

    @Test
    void locationBasesNeedNoTagLinkEither() {
        Game game = gameWithTeamAndChallenges("loc", 1);
        base(game, "Clearing", CheckInMethod.LOCATION, false, 41.1, -8.6, 20);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }

    @Test
    void unlinkedNfcBasesStillBlockGoLiveAndTheMessageCountsOnlyNfcBases() {
        Game game = gameWithTeamAndChallenges("nfc", 2);
        base(game, "Tag", CheckInMethod.NFC, false, 41.1, -8.6, null);
        base(game, "Kiosk", CheckInMethod.QR, false, 41.2, -8.7, null);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().contains("0 of 1"), error.getMessage());
    }

    @Test
    void locationBasesAtNullIslandBlockGoLive() {
        Game game = gameWithTeamAndChallenges("zero", 1);
        base(game, "Nowhere", CheckInMethod.LOCATION, false, 0.0, 0.0, 20);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("coordinates"), error.getMessage());
    }

    @Test
    void aRadiusOutsideTheSupportedBandBlocksGoLive() {
        Game game = gameWithTeamAndChallenges("radius", 1);
        Base b = base(game, "Wide", CheckInMethod.LOCATION, false, 41.1, -8.6, 20);
        // Bypass the service clamp to model a row written before the clamp existed.
        b.setCheckInRadiusM(900);
        baseRepository.save(b);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("radius"), error.getMessage());
    }

    @Test
    void overlappingLocationRingsBlockGoLive() {
        Game game = gameWithTeamAndChallenges("overlap", 2);
        // 40 m apart with 30 m radii each: the rings intersect.
        base(game, "Ring A", CheckInMethod.LOCATION, false, 41.100000, -8.600000, 30);
        base(game, "Ring B", CheckInMethod.LOCATION, false, 41.100000 + 40.0 / 111_195.0, -8.600000, 30);

        BadRequestException error = assertThrows(BadRequestException.class,
                () -> validator.validateGoLivePrerequisites(game));
        assertTrue(error.getMessage().toLowerCase().contains("overlap"), error.getMessage());
    }

    @Test
    void locationRingsThatDoNotTouchArePermitted() {
        Game game = gameWithTeamAndChallenges("apart", 2);
        base(game, "Ring A", CheckInMethod.LOCATION, false, 41.100000, -8.600000, 20);
        base(game, "Ring B", CheckInMethod.LOCATION, false, 41.100000 + 200.0 / 111_195.0, -8.600000, 20);

        assertDoesNotThrow(() -> validator.validateGoLivePrerequisites(game));
    }
}
