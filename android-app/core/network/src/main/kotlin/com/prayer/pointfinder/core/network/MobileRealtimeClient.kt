package com.prayer.pointfinder.core.network

import android.util.Log
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

internal fun buildMobileRealtimeUrl(apiBaseUrl: String, gameId: String, token: String): HttpUrl {
    val base = apiBaseUrl.toHttpUrlOrNull()
        ?: throw IllegalArgumentException("Invalid API base URL: $apiBaseUrl")

    // OkHttp HttpUrl only accepts http/https schemes. For websocket connections,
    // OkHttp upgrades these to ws/wss during the handshake.
    return HttpUrl.Builder()
        .scheme(base.scheme)
        .host(base.host)
        .port(base.port)
        .addPathSegment("ws")
        .addPathSegment("mobile")
        .addQueryParameter("gameId", gameId)
        .build()
}

/**
 * Pure resolver used by [MobileRealtimeClient] on every (re)connect to pick
 * the token that goes into the `Authorization: Bearer …` header.
 *
 * Extracted as a top-level function (instead of inlined inside `openSocket`)
 * so unit tests can exercise the refresh-on-reconnect contract without
 * spinning up a real WebSocket, a mock HTTP server, or `Dispatchers.IO`:
 * the entire token-refresh decision tree is deterministic input → output.
 *
 * Contract — mirrors iOS `MobileRealtimeClient.swift` `openConnection`:
 *  - If [tokenProvider] is null, return [fallbackToken] (the token passed to
 *    the most recent `connect()` call).
 *  - Else invoke [tokenProvider]; on success return its value.
 *  - On a thrown [tokenProvider], return [fallbackToken] so the reconnect
 *    attempt still proceeds with the stale token (the backend will reject
 *    it via `onFailure`, triggering another backoff — same behaviour as if
 *    there were no provider at all).
 *  - If [tokenProvider] returns null, return [fallbackToken]. Callers that
 *    want to force a logout on null should do so inside the callback itself
 *    (mirrors `AppSessionViewModel.configureRealtimeTokenProvider`).
 */
internal fun resolveRealtimeToken(
    tokenProvider: (() -> String?)?,
    fallbackToken: String,
    onProviderError: (Throwable) -> Unit = {},
): String {
    if (tokenProvider == null) return fallbackToken
    return try {
        tokenProvider.invoke() ?: fallbackToken
    } catch (err: Throwable) {
        onProviderError(err)
        fallbackToken
    }
}

sealed interface RealtimeConnectionState {
    data object Disconnected : RealtimeConnectionState
    data object Connecting : RealtimeConnectionState
    data object Connected : RealtimeConnectionState
    data class Reconnecting(val attempt: Int) : RealtimeConnectionState
}

@Serializable
data class RealtimeEnvelope(
    val version: Int = 1,
    val type: String,
    val gameId: String? = null,
    val emittedAt: String? = null,
    val data: JsonElement? = null,
)

/**
 * Mobile-native realtime websocket client.
 *
 * The connection is game-scoped and authenticated by token query param/header.
 * It auto-reconnects with backoff until explicitly disconnected.
 */
class MobileRealtimeClient(
    private val apiBaseUrl: String,
    private val enabled: Boolean = true,
) {
    // Single-threaded dispatcher serialises all reads/writes of mutable state
    // (webSocket, reconnectAttempt, desiredSession) so OkHttp callback threads
    // and the IO dispatcher never race.
    private val singleThread = Dispatchers.IO.limitedParallelism(1)
    private val scope = CoroutineScope(SupervisorJob() + singleThread)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val _events = MutableSharedFlow<RealtimeEnvelope>(extraBufferCapacity = 64)
    val events: SharedFlow<RealtimeEnvelope> = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow<RealtimeConnectionState>(RealtimeConnectionState.Disconnected)
    val connectionState: StateFlow<RealtimeConnectionState> = _connectionState.asStateFlow()

    /**
     * Returns a fresh access token on every (re)connect. If null is returned,
     * the client falls back to the token supplied to [connect].
     *
     * This exists to cover the 15-minute operator access-token TTL: without
     * refresh-on-reconnect, an operator that stays idle past expiry would
     * silently lose realtime updates because every reconnect attempt would
     * carry the stale token. Mirrors the iOS `tokenProvider` pattern in
     * `MobileRealtimeClient.swift`.
     *
     * Wired from `AppSessionViewModel` / `OperatorViewModel`; callers are
     * expected to perform the actual refresh (and clear the session on
     * failure) inside the callback.
     *
     * The callback runs on [singleThread] (the reconnect/open path), so any
     * blocking work it does will serialise with socket state mutations —
     * keep it fast (the token refresher already uses its own dispatcher).
     */
    var tokenProvider: (() -> String?)? = null

    // Guarded by singleThread – all access must happen within withContext(singleThread)
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var desiredSession: SessionParams? = null
    private var reconnectAttempt = 0

    fun connect(gameId: String, token: String) {
        scope.launch {
            if (!enabled) {
                updateState(RealtimeConnectionState.Disconnected)
                return@launch
            }
            val next = SessionParams(gameId = gameId, token = token)
            if (desiredSession == next && _connectionState.value == RealtimeConnectionState.Connected) {
                return@launch
            }

            desiredSession = next
            reconnectAttempt = 0
            reconnectJob?.cancel()
            openSocket()
        }
    }

    fun disconnect() {
        scope.launch {
            desiredSession = null
            reconnectAttempt = 0
            reconnectJob?.cancel()
            reconnectJob = null
            webSocket?.close(1000, "manual_disconnect")
            webSocket = null
            updateState(RealtimeConnectionState.Disconnected)
        }
    }

    private fun openSocket() {
        val target = desiredSession ?: run {
            updateState(RealtimeConnectionState.Disconnected)
            return
        }

        updateState(if (reconnectAttempt == 0) {
            RealtimeConnectionState.Connecting
        } else {
            RealtimeConnectionState.Reconnecting(reconnectAttempt)
        })

        // On (re)connect, ask the session layer for a fresh token so expired
        // operator access tokens (15-min TTL) don't silently prevent
        // reconnection. Falls back to the stored session token if no
        // tokenProvider is configured or refresh returned null. Mirrors the
        // iOS `effectiveToken` pattern in MobileRealtimeClient.swift.
        val effectiveToken = resolveRealtimeToken(
            tokenProvider = tokenProvider,
            fallbackToken = target.token,
            onProviderError = { err ->
                Log.w(TAG, "tokenProvider threw on reconnect: ${err.message}")
            },
        )
        if (effectiveToken != target.token) {
            // Cache the refreshed token so subsequent reconnect attempts
            // within the same session keep using the fresh value until the
            // session layer rotates it again.
            desiredSession = target.copy(token = effectiveToken)
        }

        webSocket?.cancel()
        val request = Request.Builder()
            .url(buildRealtimeUrl(desiredSession ?: target))
            .header("Authorization", "Bearer $effectiveToken")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    reconnectAttempt = 0
                    updateState(RealtimeConnectionState.Connected)
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching { json.decodeFromString<RealtimeEnvelope>(text) }
                    .onSuccess { envelope ->
                        _events.tryEmit(envelope)
                    }
                    .onFailure { err ->
                        Log.d(TAG, "Failed to decode realtime event: ${err.message}")
                    }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                scope.launch {
                    this@MobileRealtimeClient.webSocket = null
                    scheduleReconnect()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                scope.launch {
                    this@MobileRealtimeClient.webSocket = null
                    scheduleReconnect()
                }
            }
        })
    }

    private fun scheduleReconnect() {
        if (desiredSession == null) {
            updateState(RealtimeConnectionState.Disconnected)
            return
        }
        if (reconnectJob?.isActive == true) return

        reconnectJob = scope.launch {
            reconnectAttempt += 1
            val backoffSeconds = minOf(30L, 1L shl minOf(reconnectAttempt, 5))
            updateState(RealtimeConnectionState.Reconnecting(reconnectAttempt))
            delay(backoffSeconds * 1000L)
            if (desiredSession != null) {
                openSocket()
            }
        }
    }

    private fun buildRealtimeUrl(params: SessionParams): HttpUrl {
        return buildMobileRealtimeUrl(
            apiBaseUrl = apiBaseUrl,
            gameId = params.gameId,
            token = params.token,
        )
    }

    private data class SessionParams(
        val gameId: String,
        val token: String,
    )

    private fun updateState(next: RealtimeConnectionState) {
        val previous = _connectionState.value
        if (previous == next) return
        _connectionState.value = next
        Log.i(TAG, "Realtime state: $previous -> $next")
    }

    companion object {
        private const val TAG = "MobileRealtimeClient"
    }
}

