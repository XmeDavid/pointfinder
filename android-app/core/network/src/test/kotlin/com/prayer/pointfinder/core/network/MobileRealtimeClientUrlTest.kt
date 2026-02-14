package com.prayer.pointfinder.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class MobileRealtimeClientUrlTest {

    @Test
    fun `buildMobileRealtimeUrl uses https scheme for secure base URL`() {
        val url = buildMobileRealtimeUrl(
            apiBaseUrl = "https://pointfinder.pt",
            gameId = "game-123",
            token = "token-abc",
        )

        assertEquals("https", url.scheme)
        assertEquals("pointfinder.pt", url.host)
        assertEquals(443, url.port)
        assertEquals("/ws/mobile", url.encodedPath)
        assertEquals("game-123", url.queryParameter("gameId"))
        assertEquals("token-abc", url.queryParameter("token"))
    }

    @Test
    fun `buildMobileRealtimeUrl uses http scheme for non secure base URL and keeps explicit port`() {
        val url = buildMobileRealtimeUrl(
            apiBaseUrl = "http://localhost:8080/api",
            gameId = "g1",
            token = "t1",
        )

        assertEquals("http", url.scheme)
        assertEquals("localhost", url.host)
        assertEquals(8080, url.port)
        assertEquals("/ws/mobile", url.encodedPath)
        assertEquals("g1", url.queryParameter("gameId"))
        assertEquals("t1", url.queryParameter("token"))
    }

    @Test
    fun `buildMobileRealtimeUrl rejects invalid base URL`() {
        assertThrows(IllegalArgumentException::class.java) {
            buildMobileRealtimeUrl(
                apiBaseUrl = "not-a-url",
                gameId = "g1",
                token = "t1",
            )
        }
    }
}

