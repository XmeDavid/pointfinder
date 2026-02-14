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
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true; isLenient = true; explicitNulls = false }
    private val okHttpClient = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    private val _events = MutableSharedFlow<RealtimeEnvelope>(extraBufferCapacity = 64)
    val events: SharedFlow<RealtimeEnvelope> = _events.asSharedFlow()

    private val _connectionState = MutableStateFlow<RealtimeConnectionState>(RealtimeConnectionState.Disconnected)
    val connectionState: StateFlow<RealtimeConnectionState> = _connectionState.asStateFlow()

    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private var desiredSession: SessionParams? = null
    private var reconnectAttempt = 0

    fun connect(gameId: String, token: String) {
        if (!enabled) {
            updateState(RealtimeConnectionState.Disconnected)
            return
        }
        val next = SessionParams(gameId = gameId, token = token)
        if (desiredSession == next && _connectionState.value == RealtimeConnectionState.Connected) {
            return
        }

        desiredSession = next
        reconnectAttempt = 0
        reconnectJob?.cancel()
        openSocket()
    }

    fun disconnect() {
        desiredSession = null
        reconnectAttempt = 0
        reconnectJob?.cancel()
        reconnectJob = null
        webSocket?.close(1000, "manual_disconnect")
        webSocket = null
        updateState(RealtimeConnectionState.Disconnected)
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

        webSocket?.cancel()
        val request = Request.Builder()
            .url(buildRealtimeUrl(target))
            .header("Authorization", "Bearer ${target.token}")
            .build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                reconnectAttempt = 0
                updateState(RealtimeConnectionState.Connected)
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
                this@MobileRealtimeClient.webSocket = null
                scheduleReconnect()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                this@MobileRealtimeClient.webSocket = null
                scheduleReconnect()
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
        val base = apiBaseUrl.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("Invalid API base URL: $apiBaseUrl")
        val wsScheme = if (base.isHttps) "wss" else "ws"
        return HttpUrl.Builder()
            .scheme(wsScheme)
            .host(base.host)
            .port(base.port)
            .addPathSegment("ws")
            .addPathSegment("mobile")
            .addQueryParameter("gameId", params.gameId)
            .addQueryParameter("token", params.token)
            .build()
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

