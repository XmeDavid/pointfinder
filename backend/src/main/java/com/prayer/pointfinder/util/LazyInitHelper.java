package com.prayer.pointfinder.util;

import com.prayer.pointfinder.entity.ActivityEvent;

public final class LazyInitHelper {

    private LazyInitHelper() {}

    public static void initializeForBroadcast(ActivityEvent event) {
        event.getGame().getId();
        event.getTeam().getId();
        if (event.getBase() != null) event.getBase().getId();
        if (event.getChallenge() != null) event.getChallenge().getId();
    }
}
