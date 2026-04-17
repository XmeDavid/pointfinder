package com.prayer.pointfinder.core.data.variables

import org.junit.Assert.assertEquals
import org.junit.Test

class VariableReferenceScannerTest {
    @Test fun findsReferences() {
        assertEquals(
            listOf("secret", "place"),
            VariableReferenceScanner.scan(listOf("Find {{secret}} at {{place}}"))
        )
    }

    @Test fun deduplicates() {
        assertEquals(listOf("a"), VariableReferenceScanner.scan(listOf("{{a}} and {{a}}")))
    }

    @Test fun findsUndefined() {
        val out = VariableReferenceScanner.findUndefined(
            texts = listOf("Find {{secret}}", "{{typo}}"),
            availableKeys = setOf("secret")
        )
        assertEquals(listOf("typo"), out)
    }

    @Test fun scanIsCaseSensitiveOnLookup() {
        // Scanner returns keys verbatim; undefined check is case-sensitive so {{Secret}} != "secret".
        val out = VariableReferenceScanner.findUndefined(
            texts = listOf("Find {{Secret}}"),
            availableKeys = setOf("secret")
        )
        assertEquals(listOf("Secret"), out)
    }
}
