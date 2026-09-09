package com.prayer.pointfinder.entity;

public enum GameStatus {
    setup,
    live,
    ended;

    /**
     * Returns true if transitioning from this status to {@code target} is allowed
     * by the game lifecycle state machine.
     *
     * @param target the desired target status
     * @return true if the transition is valid
     * @see GameStatusTransition#allowedTransitions(GameStatus)
     */
    public boolean canTransitionTo(GameStatus target) {
        return GameStatusTransition.canTransition(this, target);
    }
}
