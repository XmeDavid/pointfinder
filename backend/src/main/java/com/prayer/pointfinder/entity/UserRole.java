package com.prayer.pointfinder.entity;

public enum UserRole {
    admin,
    operator,
    /** A registered player. Can claim and recover participations; no operator routes. */
    participant
}
