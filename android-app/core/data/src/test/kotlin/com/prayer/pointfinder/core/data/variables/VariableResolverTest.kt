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
}
