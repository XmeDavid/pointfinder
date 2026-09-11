package com.prayer.pointfinder.entity;

import com.prayer.pointfinder.exception.BadRequestException;

import java.util.Arrays;

/** PF-07: a coarse, stable setting label for the public summary. Purely descriptive. */
public enum PublicationCategory {
    coast,
    forest,
    city,
    other;

    /** Parses a client value; an unknown label is a 400, not a 500. */
    public static PublicationCategory parse(String value) {
        if (value == null || value.isBlank()) return null;
        return Arrays.stream(values())
                .filter(c -> c.name().equalsIgnoreCase(value.trim()))
                .findFirst()
                .orElseThrow(() -> new BadRequestException("Unknown category: " + value + " (expected coast, forest, city or other)"));
    }
}
