package com.prayer.pointfinder.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the P0 Track 2 Slice 4 contract: `MobileRealtimeClient` asks the
 * session layer for a fresh access token on every (re)connect so expired
 * operator JWTs (15-min TTL) do not silently break reconnections.
 *
 * We drive [resolveRealtimeToken] directly rather than through a live
 * WebSocket because spinning up a real socket in a unit test is slow,
 * flaky, and tangled up with OkHttp's internal dispatcher. The resolver
 * is the single decision point that gates which token ends up on the
 * `Authorization: Bearer …` header — if it's correct, the wire contract
 * is correct.
 */
class MobileRealtimeTokenProviderTest {

    @Test
    fun `null provider falls back to the connect-time token`() {
        val resolved = resolveRealtimeToken(
            tokenProvider = null,
            fallbackToken = "stored-token",
        )
        assertEquals("stored-token", resolved)
    }

    @Test
    fun `provider returning a refreshed token is used instead of fallback`() {
        val resolved = resolveRealtimeToken(
            tokenProvider = { "refreshed-token" },
            fallbackToken = "stale-token",
        )
        assertEquals("refreshed-token", resolved)
    }

    @Test
    fun `provider returning null falls back to stored token`() {
        val resolved = resolveRealtimeToken(
            tokenProvider = { null },
            fallbackToken = "stored-token",
        )
        assertEquals("stored-token", resolved)
    }

    @Test
    fun `thrown provider is captured and falls back to stored token`() {
        var captured: Throwable? = null
        val resolved = resolveRealtimeToken(
            tokenProvider = { throw IllegalStateException("refresh endpoint down") },
            fallbackToken = "stored-token",
            onProviderError = { captured = it },
        )
        assertEquals("stored-token", resolved)
        assertNotNull("onProviderError must be invoked when provider throws", captured)
        assertTrue(captured is IllegalStateException)
    }

    @Test
    fun `provider is invoked exactly once per openSocket call`() {
        var callCount = 0
        repeat(3) {
            resolveRealtimeToken(
                tokenProvider = { callCount += 1; "token-$callCount" },
                fallbackToken = "fallback",
            )
        }
        assertEquals(3, callCount)
    }

    @Test
    fun `tokenProvider is the client-level field wired from the session layer`() {
        val client = MobileRealtimeClient(
            apiBaseUrl = "https://example.test",
            enabled = false, // skip the scope.launch path; we only exercise the field
        )
        assertNull(
            "tokenProvider must default to null so clients without operator " +
                "sessions behave exactly like before Slice 4",
            client.tokenProvider,
        )

        var invocations = 0
        client.tokenProvider = {
            invocations += 1
            "fresh-token-$invocations"
        }

        // Drive it the same way `openSocket` does — this is the seam we're
        // protecting. If someone removes the field, this line fails to
        // compile; if they change its signature, the resolver test above
        // fails.
        val token = resolveRealtimeToken(
            tokenProvider = client.tokenProvider,
            fallbackToken = "fallback",
        )
        assertEquals("fresh-token-1", token)
        assertEquals(1, invocations)

        // A subsequent reconnect attempt must call the provider again — it
        // is not cached by the resolver itself.
        val second = resolveRealtimeToken(
            tokenProvider = client.tokenProvider,
            fallbackToken = "fallback",
        )
        assertEquals("fresh-token-2", second)
        assertEquals(2, invocations)
    }
}
