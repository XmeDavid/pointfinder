package com.prayer.pointfinder.core.platform

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NfcPayloadCodecTest {

    @Test
    fun `normalizeBaseId passes through valid lowercase UUID unchanged`() {
        val lowercase = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        assertEquals(lowercase, NfcPayloadCodec.normalizeBaseId(lowercase))
    }

    @Test
    fun `normalizeBaseId lowercases valid uppercase UUID`() {
        val uppercase = "A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
        assertEquals(
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            NfcPayloadCodec.normalizeBaseId(uppercase),
        )
    }

    @Test
    fun `normalizeBaseId lowercases mixed-case UUID`() {
        val mixed = "A1b2C3d4-E5f6-7890-AbCd-Ef1234567890"
        assertEquals(
            "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            NfcPayloadCodec.normalizeBaseId(mixed),
        )
    }

    @Test
    fun `normalizeBaseId trims and returns non-UUID string as-is`() {
        assertEquals("some-custom-id", NfcPayloadCodec.normalizeBaseId("  some-custom-id  "))
    }

    @Test
    fun `normalizeBaseId returns non-UUID string without modification`() {
        assertEquals("base-42", NfcPayloadCodec.normalizeBaseId("base-42"))
    }

    @Test
    fun `normalizeBaseId returns null for null input`() {
        assertNull(NfcPayloadCodec.normalizeBaseId(null))
    }

    @Test
    fun `normalizeBaseId returns null for blank string`() {
        assertNull(NfcPayloadCodec.normalizeBaseId("   "))
    }

    @Test
    fun `normalizeBaseId returns null for empty string`() {
        assertNull(NfcPayloadCodec.normalizeBaseId(""))
    }
}
