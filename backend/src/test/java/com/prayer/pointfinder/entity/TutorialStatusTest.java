package com.prayer.pointfinder.entity;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * The wire contract: the database and the enum use uppercase names, every
 * client sees lowercase. Unknown input is rejected by the caller, not guessed.
 */
class TutorialStatusTest {

    @Test
    void wireNamesAreLowercase() {
        assertEquals("in_progress", TutorialStatus.IN_PROGRESS.wireName());
        assertEquals("completed", TutorialStatus.COMPLETED.wireName());
        assertEquals("skipped", TutorialStatus.SKIPPED.wireName());
    }

    @Test
    void fromWireAcceptsLowercaseAndTrimsAndIsCaseInsensitive() {
        assertEquals(TutorialStatus.IN_PROGRESS, TutorialStatus.fromWire("in_progress"));
        assertEquals(TutorialStatus.COMPLETED, TutorialStatus.fromWire("  COMPLETED "));
        assertEquals(TutorialStatus.SKIPPED, TutorialStatus.fromWire("Skipped"));
    }

    @Test
    void fromWireReturnsNullForUnknownInput() {
        assertNull(TutorialStatus.fromWire("paused"));
        assertNull(TutorialStatus.fromWire(""));
        assertNull(TutorialStatus.fromWire(null));
    }
}
