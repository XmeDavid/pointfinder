package com.prayer.pointfinder.entity;

import com.prayer.pointfinder.exception.BadRequestException;

import java.util.Arrays;

/** OW-06: why an account reported a public listing. */
public enum PublicationReportReason {
    inappropriate,
    misleading,
    unsafe,
    spam,
    other;

    /** Parses a client value; a missing or unknown reason is a 400, not a 500. */
    public static PublicationReportReason parse(String value) {
        if (value == null || value.isBlank()) {
            throw new BadRequestException("A report needs a reason");
        }
        return Arrays.stream(values())
                .filter(r -> r.name().equalsIgnoreCase(value.trim()))
                .findFirst()
                .orElseThrow(() -> new BadRequestException("Unknown report reason: " + value
                        + " (expected inappropriate, misleading, unsafe, spam or other)"));
    }
}
