package com.prayer.pointfinder.entity;

public enum InviteStatus {
    pending,
    accepted,
    /** The invitee refused the invitation. Terminal, exactly like {@link #accepted}. */
    declined,
    expired
}
