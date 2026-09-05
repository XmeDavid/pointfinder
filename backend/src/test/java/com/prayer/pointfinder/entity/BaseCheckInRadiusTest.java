package com.prayer.pointfinder.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Radius resolution contract: a base uses its own override when set,
 * otherwise the owning game's default, otherwise the product default of 15 m.
 */
class BaseCheckInRadiusTest {

    @Test
    void baseOverrideWinsOverGameDefault() {
        Game game = Game.builder().defaultCheckInRadiusM(40).build();
        Base base = Base.builder().game(game).checkInRadiusM(12).build();

        assertEquals(12, base.resolvedCheckInRadiusM());
    }

    @Test
    void gameDefaultUsedWhenBaseHasNoOverride() {
        Game game = Game.builder().defaultCheckInRadiusM(40).build();
        Base base = Base.builder().game(game).build();

        assertEquals(40, base.resolvedCheckInRadiusM());
    }

    @Test
    void productDefaultUsedWhenNeitherIsSet() {
        Base base = Base.builder().build();

        assertEquals(15, base.resolvedCheckInRadiusM());
    }

    @Test
    void newBasesAndGamesDefaultToNfc() {
        assertEquals(CheckInMethod.NFC, Base.builder().build().getCheckInMethod());
        assertEquals(CheckInMethod.NFC, Game.builder().build().getDefaultCheckInMethod());
        assertEquals(15, Game.builder().build().getDefaultCheckInRadiusM());
    }
}
