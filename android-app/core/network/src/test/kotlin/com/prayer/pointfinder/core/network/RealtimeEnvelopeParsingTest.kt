package com.prayer.pointfinder.core.network

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RealtimeEnvelopeParsingTest {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }

    @Test
    fun `valid JSON envelope extracts type and data correctly`() {
        val raw = """
            {
                "version": 1,
                "type": "leaderboard",
                "gameId": "game-abc",
                "emittedAt": "2026-03-18T10:00:00Z",
                "data": {"scores": [1, 2, 3]}
            }
        """.trimIndent()

        val envelope = json.decodeFromString<RealtimeEnvelope>(raw)

        assertEquals(1, envelope.version)
        assertEquals("leaderboard", envelope.type)
        assertEquals("game-abc", envelope.gameId)
        assertEquals("2026-03-18T10:00:00Z", envelope.emittedAt)
        assertEquals("""{"scores":[1,2,3]}""", envelope.data.toString())
    }

    @Test
    fun `envelope with only required fields parses successfully`() {
        val raw = """{"type": "activity"}"""

        val envelope = json.decodeFromString<RealtimeEnvelope>(raw)

        assertEquals("activity", envelope.type)
        assertEquals(1, envelope.version)
        assertNull(envelope.gameId)
        assertNull(envelope.emittedAt)
        assertNull(envelope.data)
    }

    @Test
    fun `envelope with unknown fields is parsed without error`() {
        val raw = """{"type": "notification", "unknownField": true, "extra": 42}"""

        val envelope = json.decodeFromString<RealtimeEnvelope>(raw)

        assertEquals("notification", envelope.type)
    }

    @Test
    fun `malformed JSON does not crash and returns failure`() {
        val raw = "not valid json {{"

        val result = runCatching { json.decodeFromString<RealtimeEnvelope>(raw) }

        assert(result.isFailure) { "Expected parsing to fail for malformed JSON" }
    }

    @Test
    fun `empty string does not crash and returns failure`() {
        val result = runCatching { json.decodeFromString<RealtimeEnvelope>("") }

        assert(result.isFailure) { "Expected parsing to fail for empty string" }
    }
}
