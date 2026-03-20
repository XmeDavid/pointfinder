package com.prayer.pointfinder.util;

import java.security.SecureRandom;
import java.util.stream.Collectors;

/**
 * Generates random alphanumeric codes using a cryptographically secure random source.
 * Uses an ambiguity-reduced alphabet by default (no 0, O, 1, I) to avoid confusion
 * when codes are read aloud or printed.
 */
public final class CodeGenerator {

    /** Ambiguity-reduced alphabet: excludes 0, O, 1, I to avoid visual confusion. */
    public static final String AMBIGUITY_REDUCED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    /** Full uppercase alphanumeric alphabet. */
    public static final String FULL_ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    private static final SecureRandom RANDOM = new SecureRandom();

    private CodeGenerator() {
        // utility class
    }

    /**
     * Generates a random code of the given length using the ambiguity-reduced alphabet.
     */
    public static String generate(int length) {
        return generate(length, AMBIGUITY_REDUCED_ALPHABET);
    }

    /**
     * Generates a random code of the given length using the specified alphabet.
     */
    public static String generate(int length, String alphabet) {
        return RANDOM.ints(length, 0, alphabet.length())
                .mapToObj(alphabet::charAt)
                .map(String::valueOf)
                .collect(Collectors.joining());
    }
}
