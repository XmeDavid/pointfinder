package com.prayer.pointfinder.core.data.variables

import org.junit.Assert.assertEquals
import org.junit.Test

class VariableResolverTest {
    @Test fun substitutesSingleKey() {
        assertEquals("FOX", VariableResolver.resolve("{{secret}}", mapOf("secret" to "FOX")))
    }

    @Test fun substitutesMixed() {
        assertEquals(
            "answer-FOX",
            VariableResolver.resolve("{{prefix}}-FOX", mapOf("prefix" to "answer"))
        )
    }

    @Test fun leavesUnknownKeysAsIs() {
        assertEquals("{{foo}}", VariableResolver.resolve("{{foo}}", emptyMap()))
    }

    @Test fun emptyInput() {
        assertEquals("", VariableResolver.resolve("", emptyMap()))
        assertEquals("", VariableResolver.resolve(null, emptyMap()))
    }

    @Test fun substitutesMultipleDistinctKeysInOneString() {
        val vars = mapOf("a" to "AA", "b" to "BB")
        assertEquals("prefix AA middle BB tail", VariableResolver.resolve("prefix {{a}} middle {{b}} tail", vars))
    }

    @Test fun doesNotReSubstituteValuesContainingPlaceholders() {
        val vars = mapOf("key" to "{{other}}", "other" to "FINAL")
        // Output of key substitution should NOT be re-scanned.
        assertEquals("{{other}}", VariableResolver.resolve("{{key}}", vars))
    }
}
