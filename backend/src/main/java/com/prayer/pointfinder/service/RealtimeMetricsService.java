package com.prayer.pointfinder.service;

import com.prayer.pointfinder.dto.response.RealtimeStatsResponse;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * P0 Track 2 Slice 5 — observability for the realtime recovery contract.
 *
 * <p>Tracks per-game WebSocket lifecycle events (connect, disconnect,
 * heuristic reconnect) for both hubs so operators can tell whether the
 * realtime layer is actually working during a live event. Without this,
 * a stale dashboard looks identical to a healthy one.
 *
 * <h2>Two layers of tracking</h2>
 *
 * <ol>
 *   <li><b>Cumulative Micrometer counters</b> — tagged by {@code gameId}
 *       (and {@code reason} for disconnects). These drive the existing
 *       {@code /actuator/metrics/realtime.*} observability surface and
 *       match the pattern established for {@code uploads.*}.</li>
 *   <li><b>Rolling per-game event windows</b> — a bounded deque of event
 *       timestamps per game used to compute the "last hour" counts on the
 *       dashboard widget. Lifetime counters alone cannot answer "is the
 *       game alive right now?", so the rolling window is a product
 *       requirement (see the acceptance scenario in
 *       {@code docs/specs/2026-04-08-post-pilot-reliability-and-operator-workflow.md}).
 *       The rolling list is trimmed on every read.</li>
 * </ol>
 *
 * <h2>Reconnect detection</h2>
 *
 * A connect from a client whose {@code clientId} we saw disconnect within
 * the previous {@link #RECONNECT_WINDOW} is counted as a reconnect on top
 * of the raw connect counter. {@code clientId} is:
 *
 * <ul>
 *   <li>STOMP: operator user id (UUID). A web admin that drops and
 *       reconnects within the window counts as one reconnect.</li>
 *   <li>Mobile: player id or operator user id from the handshake
 *       attributes. Device-level reconnects fall into the same bucket
 *       because the mobile hub is one-WebSocket-per-principal.</li>
 * </ul>
 *
 * When a disconnect fires we store {@code (gameId, clientId) -> timestamp};
 * the next connect for the same pair within {@link #RECONNECT_WINDOW}
 * consumes that entry and increments the reconnect counter. Stale entries
 * are swept lazily on every disconnect write so the map stays bounded.
 *
 * <p>Known limitation: a STOMP session that gets an entirely new HTTP
 * session id on reconnect but the same user id still counts as a
 * reconnect (good). A player who rejoins the game under a fresh player id
 * looks like a raw connect, not a reconnect. This matches the product
 * intent — we want to see real socket recovery, not new joins — and is
 * documented in the realtime docs.
 */
@Slf4j
@Service
public class RealtimeMetricsService {

    /**
     * A connect arriving within this window after a disconnect from the
     * same client id is counted as a reconnect. 30s comfortably covers
     * the iOS exponential-backoff worst case ({@code min(30, 1 << attempt)})
     * and the web admin STOMP reconnect delay, without catching slow
     * manual app restarts.
     */
    static final Duration RECONNECT_WINDOW = Duration.ofSeconds(30);

    /** Rolling window used by the dashboard "last hour" counts. */
    private static final Duration ROLLING_WINDOW = Duration.ofHours(1);

    /** Hard cap on rolling events per game bucket to bound memory under burst. */
    private static final int MAX_ROLLING_EVENTS_PER_BUCKET = 10_000;

    /** Hard cap on tracked reconnect-candidate entries per game. */
    private static final int MAX_RECONNECT_CANDIDATES_PER_GAME = 1_000;

    private final MeterRegistry meterRegistry;

    // Per-game active session counters, one per hub. Published as Micrometer
    // gauges tagged by gameId on first touch. AtomicInteger so gauge reads
    // are cheap and thread-safe.
    private final Map<UUID, AtomicInteger> stompActiveByGame = new ConcurrentHashMap<>();
    private final Map<UUID, AtomicInteger> mobileActiveByGame = new ConcurrentHashMap<>();

    // Per-game rolling event timestamps. Each deque is mutated under its
    // own monitor so registerConnect/Disconnect on different games never
    // contend with each other.
    private final Map<UUID, Deque<Instant>> stompConnectEvents = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> stompDisconnectEvents = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> stompReconnectEvents = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> mobileConnectEvents = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> mobileDisconnectEvents = new ConcurrentHashMap<>();
    private final Map<UUID, Deque<Instant>> mobileReconnectEvents = new ConcurrentHashMap<>();

    // (gameId, clientId) -> lastDisconnectAt. Used to classify the next
    // connect from the same client as a reconnect.
    private final Map<UUID, Map<String, Instant>> stompReconnectCandidates = new ConcurrentHashMap<>();
    private final Map<UUID, Map<String, Instant>> mobileReconnectCandidates = new ConcurrentHashMap<>();

    public RealtimeMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    // ───────────────────────── STOMP hub hooks ─────────────────────────

    public void recordStompConnect(UUID gameId, String clientId) {
        if (gameId == null) return;
        Instant now = Instant.now();
        meterRegistry.counter("realtime.stomp.connect.total",
                Tags.of("gameId", gameId.toString())).increment();
        appendEvent(stompConnectEvents, gameId, now);

        int active = activeCounter(stompActiveByGame, "realtime.stomp.active_sessions", gameId)
                .incrementAndGet();
        if (log.isDebugEnabled()) {
            log.debug("STOMP connect game={} active={} client={}", gameId, active, clientId);
        }

        if (clientId != null && consumeReconnectCandidate(stompReconnectCandidates, gameId, clientId, now)) {
            meterRegistry.counter("realtime.stomp.reconnect.total",
                    Tags.of("gameId", gameId.toString())).increment();
            appendEvent(stompReconnectEvents, gameId, now);
        }
    }

    public void recordStompDisconnect(UUID gameId, String clientId, String reason) {
        if (gameId == null) return;
        Instant now = Instant.now();
        String normalizedReason = reason == null || reason.isBlank() ? "unknown" : reason;
        meterRegistry.counter("realtime.stomp.disconnect.total",
                Tags.of("gameId", gameId.toString(), "reason", normalizedReason)).increment();
        appendEvent(stompDisconnectEvents, gameId, now);

        AtomicInteger active = activeCounter(stompActiveByGame, "realtime.stomp.active_sessions", gameId);
        int next = active.updateAndGet(v -> Math.max(0, v - 1));
        if (log.isDebugEnabled()) {
            log.debug("STOMP disconnect game={} active={} reason={} client={}", gameId, next, normalizedReason, clientId);
        }

        if (clientId != null) {
            rememberReconnectCandidate(stompReconnectCandidates, gameId, clientId, now);
        }
    }

    // ───────────────────────── Mobile hub hooks ────────────────────────

    public void recordMobileConnect(UUID gameId, String clientId) {
        if (gameId == null) return;
        Instant now = Instant.now();
        meterRegistry.counter("realtime.mobile.connect.total",
                Tags.of("gameId", gameId.toString())).increment();
        appendEvent(mobileConnectEvents, gameId, now);

        int active = activeCounter(mobileActiveByGame, "realtime.mobile.active_sessions", gameId)
                .incrementAndGet();
        if (log.isDebugEnabled()) {
            log.debug("Mobile connect game={} active={} client={}", gameId, active, clientId);
        }

        if (clientId != null && consumeReconnectCandidate(mobileReconnectCandidates, gameId, clientId, now)) {
            meterRegistry.counter("realtime.mobile.reconnect.total",
                    Tags.of("gameId", gameId.toString())).increment();
            appendEvent(mobileReconnectEvents, gameId, now);
        }
    }

    public void recordMobileDisconnect(UUID gameId, String clientId, String reason) {
        if (gameId == null) return;
        Instant now = Instant.now();
        String normalizedReason = reason == null || reason.isBlank() ? "unknown" : reason;
        meterRegistry.counter("realtime.mobile.disconnect.total",
                Tags.of("gameId", gameId.toString(), "reason", normalizedReason)).increment();
        appendEvent(mobileDisconnectEvents, gameId, now);

        AtomicInteger active = activeCounter(mobileActiveByGame, "realtime.mobile.active_sessions", gameId);
        int next = active.updateAndGet(v -> Math.max(0, v - 1));
        if (log.isDebugEnabled()) {
            log.debug("Mobile disconnect game={} active={} reason={} client={}", gameId, next, normalizedReason, clientId);
        }

        if (clientId != null) {
            rememberReconnectCandidate(mobileReconnectCandidates, gameId, clientId, now);
        }
    }

    // ─────────────────────────── Stats export ───────────────────────────

    /**
     * Builds the dashboard view of the realtime health for a single game.
     * Trims every rolling bucket first so the returned counts reflect
     * only the {@link #ROLLING_WINDOW}.
     */
    public RealtimeStatsResponse getStatsForGame(UUID gameId) {
        Instant now = Instant.now();
        Instant cutoff = now.minus(ROLLING_WINDOW);

        int stompActive = currentActive(stompActiveByGame, gameId);
        int mobileActive = currentActive(mobileActiveByGame, gameId);

        long stompConnects = countSince(stompConnectEvents, gameId, cutoff);
        long mobileConnects = countSince(mobileConnectEvents, gameId, cutoff);
        long stompDisconnects = countSince(stompDisconnectEvents, gameId, cutoff);
        long mobileDisconnects = countSince(mobileDisconnectEvents, gameId, cutoff);
        long stompReconnects = countSince(stompReconnectEvents, gameId, cutoff);
        long mobileReconnects = countSince(mobileReconnectEvents, gameId, cutoff);

        return RealtimeStatsResponse.builder()
                .stompActiveSessions(stompActive)
                .mobileActiveSessions(mobileActive)
                .totalActiveSessions(stompActive + mobileActive)
                .stompConnectsLastHour(stompConnects)
                .mobileConnectsLastHour(mobileConnects)
                .stompDisconnectsLastHour(stompDisconnects)
                .mobileDisconnectsLastHour(mobileDisconnects)
                .estimatedReconnectsLastHour(stompReconnects + mobileReconnects)
                .lastUpdated(now)
                .build();
    }

    // ───────────────────────────── internals ────────────────────────────

    private AtomicInteger activeCounter(Map<UUID, AtomicInteger> store, String meterName, UUID gameId) {
        return store.computeIfAbsent(gameId, id -> {
            AtomicInteger holder = new AtomicInteger(0);
            // Register a single gauge per (meterName, gameId) tag combination.
            // Subsequent register calls with the same tags are idempotent in
            // Micrometer and return the existing gauge.
            Gauge.builder(meterName, holder, AtomicInteger::doubleValue)
                    .tag("gameId", id.toString())
                    .register(meterRegistry);
            return holder;
        });
    }

    private int currentActive(Map<UUID, AtomicInteger> store, UUID gameId) {
        AtomicInteger holder = store.get(gameId);
        return holder == null ? 0 : Math.max(0, holder.get());
    }

    private void appendEvent(Map<UUID, Deque<Instant>> bucket, UUID gameId, Instant now) {
        Deque<Instant> events = bucket.computeIfAbsent(gameId, id -> new ArrayDeque<>());
        synchronized (events) {
            events.addLast(now);
            if (events.size() > MAX_ROLLING_EVENTS_PER_BUCKET) {
                events.pollFirst();
            }
        }
    }

    private long countSince(Map<UUID, Deque<Instant>> bucket, UUID gameId, Instant cutoff) {
        Deque<Instant> events = bucket.get(gameId);
        if (events == null) return 0;
        synchronized (events) {
            while (!events.isEmpty() && events.peekFirst().isBefore(cutoff)) {
                events.pollFirst();
            }
            return events.size();
        }
    }

    private void rememberReconnectCandidate(
            Map<UUID, Map<String, Instant>> store,
            UUID gameId,
            String clientId,
            Instant now
    ) {
        Map<String, Instant> perGame = store.computeIfAbsent(gameId, id -> new ConcurrentHashMap<>());
        perGame.put(clientId, now);
        if (perGame.size() > MAX_RECONNECT_CANDIDATES_PER_GAME) {
            Instant cutoff = now.minus(RECONNECT_WINDOW);
            perGame.entrySet().removeIf(entry -> entry.getValue().isBefore(cutoff));
        }
    }

    private boolean consumeReconnectCandidate(
            Map<UUID, Map<String, Instant>> store,
            UUID gameId,
            String clientId,
            Instant now
    ) {
        Map<String, Instant> perGame = store.get(gameId);
        if (perGame == null) return false;
        Instant lastDisconnect = perGame.remove(clientId);
        if (lastDisconnect == null) return false;
        return !lastDisconnect.isBefore(now.minus(RECONNECT_WINDOW));
    }

    // ─── Test-only helpers ─────────────────────────────────────────────

    /**
     * Visible-for-testing reset. Production lifecycle has no use for a
     * reset — the service lives for the app lifetime — but tests need
     * a clean slate between cases.
     */
    void resetForTests() {
        stompActiveByGame.clear();
        mobileActiveByGame.clear();
        stompConnectEvents.clear();
        stompDisconnectEvents.clear();
        stompReconnectEvents.clear();
        mobileConnectEvents.clear();
        mobileDisconnectEvents.clear();
        mobileReconnectEvents.clear();
        stompReconnectCandidates.clear();
        mobileReconnectCandidates.clear();
    }
}
