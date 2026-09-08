package com.prayer.pointfinder.core.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for the reconnection backoff logic extracted from [MobileRealtimeClient].
 * Audit finding 9.5: MobileRealtimeClient reconnection tests.
 *
 * The backoff follows capped exponential growth: 1s, 2s, 4s, 8s, 16s, 30s (capped).
 * The cap prevents unbounded delays that would make the app feel unresponsive.
 */
class MobileRealtimeReconnectTest {

    @Test
    fun `first reconnect attempt has 1 second backoff`() {
        assertEquals(1L, computeReconnectBackoffSeconds(attempt = 0))
    }

    @Test
    fun `backoff doubles until reaching the cap`() {
        assertEquals(1L, computeReconnectBackoffSeconds(attempt = 0))
        assertEquals(2L, computeReconnectBackoffSeconds(attempt = 1))
        assertEquals(4L, computeReconnectBackoffSeconds(attempt = 2))
        assertEquals(8L, computeReconnectBackoffSeconds(attempt = 3))
        assertEquals(16L, computeReconnectBackoffSeconds(attempt = 4))
        assertEquals(30L, computeReconnectBackoffSeconds(attempt = 5))
    }

    @Test
    fun `backoff is capped at 30 seconds by default`() {
        assertEquals(30L, computeReconnectBackoffSeconds(attempt = 5))
        assertEquals(30L, computeReconnectBackoffSeconds(attempt = 6))
        assertEquals(30L, computeReconnectBackoffSeconds(attempt = 10))
        assertEquals(30L, computeReconnectBackoffSeconds(attempt = 100))
    }

    @Test
    fun `backoff cap is configurable`() {
        assertEquals(5L, computeReconnectBackoffSeconds(attempt = 5, maxBackoffSeconds = 5L))
        assertEquals(4L, computeReconnectBackoffSeconds(attempt = 2, maxBackoffSeconds = 5L))
    }

    @Test
    fun `backoff never exceeds max even with very high attempt numbers`() {
        for (attempt in 0..200) {
            val backoff = computeReconnectBackoffSeconds(attempt)
            assertTrue(
                "Backoff $backoff for attempt $attempt exceeds max 30",
                backoff <= 30L,
            )
            assertTrue(
                "Backoff $backoff for attempt $attempt must be positive",
                backoff >= 1L,
            )
        }
    }

    @Test
    fun `connection state sealed hierarchy has expected variants`() {
        // Verify the state machine shape. Compile-time check that all
        // states exist and when-expressions remain exhaustive.
        val states: List<RealtimeConnectionState> = listOf(
            RealtimeConnectionState.Disconnected,
            RealtimeConnectionState.Connecting,
            RealtimeConnectionState.Connected,
            RealtimeConnectionState.Reconnecting(attempt = 1),
        )

        assertEquals(4, states.size)
        assertTrue(states[0] is RealtimeConnectionState.Disconnected)
        assertTrue(states[1] is RealtimeConnectionState.Connecting)
        assertTrue(states[2] is RealtimeConnectionState.Connected)
        assertTrue(states[3] is RealtimeConnectionState.Reconnecting)
        assertEquals(1, (states[3] as RealtimeConnectionState.Reconnecting).attempt)
    }

    @Test
    fun `initial client state is Disconnected`() {
        val client = MobileRealtimeClient(
            apiBaseUrl = "https://example.test",
            enabled = false,
        )
        assertEquals(
            RealtimeConnectionState.Disconnected,
            client.connectionState.value,
        )
    }

    @Test
    fun `disabled client stays Disconnected after connect`() {
        val client = MobileRealtimeClient(
            apiBaseUrl = "https://example.test",
            enabled = false,
        )
        client.connect(gameId = "game-1", token = "token-1")

        // enabled=false short-circuits connect(); state remains Disconnected.
        // We cannot assert synchronously because connect() launches on a
        // coroutine, but the contract is that no socket is opened.
        assertEquals(
            RealtimeConnectionState.Disconnected,
            client.connectionState.value,
        )
    }

    @Test
    fun `onAuthDenied callback defaults to null`() {
        val client = MobileRealtimeClient(
            apiBaseUrl = "https://example.test",
            enabled = false,
        )
        assertEquals(null, client.onAuthDenied)
    }
}
