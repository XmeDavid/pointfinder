package com.prayer.pointfinder.xp;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The numbers agreed with the product owner on 2026-09-10, formula version 1. */
class XpLevelsTest {

    @Test
    void levelThresholdsFollowTheAgreedCurve() {
        assertEquals(0, XpLevels.xpForLevel(0));
        assertEquals(200, XpLevels.xpForLevel(1));
        assertEquals(510, XpLevels.xpForLevel(2));
        assertTrue(XpLevels.xpForLevel(21) > 11_500 && XpLevels.xpForLevel(21) < 12_500, String.valueOf(XpLevels.xpForLevel(21)));
        assertTrue(XpLevels.xpForLevel(500) > 850_000 && XpLevels.xpForLevel(500) < 900_000, String.valueOf(XpLevels.xpForLevel(500)));
    }

    @Test
    void levelIsTheHighestThresholdReached() {
        assertEquals(0, XpLevels.levelFor(0));
        assertEquals(0, XpLevels.levelFor(199));
        assertEquals(1, XpLevels.levelFor(200));
        assertEquals(1, XpLevels.levelFor(509));
        assertEquals(2, XpLevels.levelFor(510));
        assertEquals(21, XpLevels.levelFor(XpLevels.xpForLevel(21)));
        assertEquals(20, XpLevels.levelFor(XpLevels.xpForLevel(21) - 1));
    }

    @Test
    void factorStartsAtAFifthCrossesOneAroundTwentyOneAndCapsAtTwo() {
        assertEquals(new BigDecimal("0.2000"), XpLevels.factorForLevel(0));
        assertTrue(XpLevels.factorForLevel(21).doubleValue() > 1.05 && XpLevels.factorForLevel(21).doubleValue() < 1.15);
        assertEquals(new BigDecimal("2.0000"), XpLevels.factorForLevel(500));
        assertEquals(new BigDecimal("2.0000"), XpLevels.factorForLevel(5000));
    }

    @Test
    void appliedAmountsRoundAndNeverVanish() {
        assertEquals(1, XpLevels.apply(1, new BigDecimal("0.2000")), "a non-zero base always pays at least 1");
        assertEquals(1, XpLevels.apply(5, new BigDecimal("0.2000")));
        assertEquals(10, XpLevels.apply(50, new BigDecimal("0.2000")));
        assertEquals(60, XpLevels.apply(300, new BigDecimal("0.2000")));
        assertEquals(0, XpLevels.apply(0, new BigDecimal("2.0000")));
    }

    @Test
    void placementScalesByTheShareOfPeopleBeaten() {
        // First of ten equal teams of six, beat everyone: full rank and size terms.
        assertEquals(1000 + 500, XpLevels.placementBase(10, 1, 60, 6, 54));
        // Last place beats nobody.
        assertEquals(0, XpLevels.placementBase(10, 10, 60, 6, 0));
        // Two equal teams, the winner: (2/1)*100 + (2)*50 = 300.
        assertEquals(300, XpLevels.placementBase(2, 1, 4, 2, 2));
        // A pair beating a large field earns more than a pair beating pairs, through the capped size term.
        assertEquals(200 + 500, XpLevels.placementBase(2, 1, 102, 2, 100));
        assertTrue(XpLevels.placementBase(2, 1, 102, 2, 100) > XpLevels.placementBase(2, 1, 4, 2, 2));
        // Fifth of ten, having beaten half the people in other teams: half of the rank term plus half the size term.
        assertEquals((int) Math.round(0.5 * (200 + 500)), XpLevels.placementBase(10, 5, 60, 6, 27));
        // A single team is never ranked.
        assertEquals(0, XpLevels.placementBase(1, 1, 6, 6, 0));
    }
}
