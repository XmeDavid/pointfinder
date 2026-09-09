package com.prayer.pointfinder.entity;

import java.util.EnumSet;
import java.util.Set;

/**
 * Sealed interface modeling the allowed game lifecycle transitions.
 *
 * <p>The game state machine permits these transitions:
 * <pre>
 *   setup -> live       (go live after prerequisites met)
 *   live  -> ended      (end the game)
 *   live  -> setup      (revert to setup, keeps assignments)
 *   ended -> setup      (reset, optionally clearing progress)
 *   ended -> live       (re-live a finished game)
 * </pre>
 *
 * <p>Each permitted subtype encodes one transition as a compile-time record.
 * Use {@link #allowedTransitions(GameStatus)} or {@link #canTransition(GameStatus, GameStatus)}
 * for runtime checks.
 */
public sealed interface GameStatusTransition {

    GameStatus from();
    GameStatus to();

    /** setup -> live: go live after readiness prerequisites are satisfied. */
    record GoLive() implements GameStatusTransition {
        @Override public GameStatus from() { return GameStatus.setup; }
        @Override public GameStatus to()   { return GameStatus.live; }
    }

    /** live -> ended: end a running game. */
    record EndGame() implements GameStatusTransition {
        @Override public GameStatus from() { return GameStatus.live; }
        @Override public GameStatus to()   { return GameStatus.ended; }
    }

    /** live -> setup: revert a running game back to setup (keeps assignments). */
    record RevertToSetup() implements GameStatusTransition {
        @Override public GameStatus from() { return GameStatus.live; }
        @Override public GameStatus to()   { return GameStatus.setup; }
    }

    /** ended -> setup: reset a finished game to setup (optionally clearing progress). */
    record ResetToSetup() implements GameStatusTransition {
        @Override public GameStatus from() { return GameStatus.ended; }
        @Override public GameStatus to()   { return GameStatus.setup; }
    }

    /** ended -> live: re-live a finished game. */
    record ReLive() implements GameStatusTransition {
        @Override public GameStatus from() { return GameStatus.ended; }
        @Override public GameStatus to()   { return GameStatus.live; }
    }

    /**
     * Returns the set of statuses reachable from the given status.
     *
     * @param from the current game status
     * @return an unmodifiable set of allowed target statuses (never null, may be empty)
     */
    static Set<GameStatus> allowedTransitions(GameStatus from) {
        return switch (from) {
            case setup -> EnumSet.of(GameStatus.live);
            case live  -> EnumSet.of(GameStatus.ended, GameStatus.setup);
            case ended -> EnumSet.of(GameStatus.live, GameStatus.setup);
        };
    }

    /**
     * Checks whether a transition from one status to another is allowed.
     *
     * @param from the current game status
     * @param to   the desired target status
     * @return true if the transition is valid
     */
    static boolean canTransition(GameStatus from, GameStatus to) {
        return from != to && allowedTransitions(from).contains(to);
    }
}
