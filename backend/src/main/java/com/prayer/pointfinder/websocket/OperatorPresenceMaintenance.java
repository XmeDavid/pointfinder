package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.websocket.presence.OperatorPresenceStore;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Keeps this instance's presence rows alive and reaps rows of instances
 * that stopped.
 *
 * <p>The heartbeat is per instance by nature and runs on every replica; it
 * upserts the sessions this instance still owns, so rows lost to a pause or
 * an outage return while the sockets are open. The
 * expiry sweep is a coordinated job (see {@code ScheduledJobs}); it deletes
 * sessions not refreshed within three TTLs and re-broadcasts presence for the
 * affected games so clients on both instances see the crashed node's
 * operators disappear.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OperatorPresenceMaintenance {

    private static final int EXPIRE_BATCH = 500;

    private final OperatorPresenceStore store;
    private final OperatorPresenceTracker tracker;
    private final InstanceIdentity instance;
    private final HaProperties haProperties;
    private final OperatorPresenceEventListener presenceEventListener;

    @Scheduled(fixedRateString = "${app.ha.presence.heartbeat-interval-ms:15000}")
    public void heartbeat() {
        try {
            tracker.heartbeat();
        } catch (RuntimeException ex) {
            log.warn("[PRESENCE] heartbeat failed: {}", ex.getMessage());
        }
    }

    /** Coordinated: run on one instance at a time. Returns games whose presence changed. */
    public List<UUID> expireStaleSessions() {
        Duration ttl = Duration.ofSeconds(haProperties.getPresence().getTtlSeconds());
        Instant olderThan = Instant.now().minus(ttl);
        List<UUID> games = store.expire(olderThan, EXPIRE_BATCH);
        for (UUID gameId : games) {
            presenceEventListener.broadcastPresence(gameId);
        }
        if (!games.isEmpty()) {
            log.info("[PRESENCE] expired stale sessions; re-broadcast presence for {} game(s)", games.size());
        }
        return games;
    }

    @PreDestroy
    public void releaseOwnSessions() {
        try {
            List<UUID> games = store.removeInstance(instance.id());
            for (UUID gameId : games) {
                presenceEventListener.broadcastPresence(gameId);
            }
        } catch (RuntimeException ex) {
            log.warn("[PRESENCE] could not release sessions on shutdown: {}", ex.getMessage());
        }
    }
}
