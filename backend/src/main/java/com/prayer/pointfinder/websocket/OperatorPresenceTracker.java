package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.config.HaProperties;
import com.prayer.pointfinder.ha.InstanceIdentity;
import com.prayer.pointfinder.websocket.presence.InMemoryOperatorPresenceStore;
import com.prayer.pointfinder.websocket.presence.OperatorPresenceStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Which operators currently have a game open. Backed by the shared
 * {@link OperatorPresenceStore}, so a game's presence aggregates sessions
 * connected to either backend, and a session on one instance never removes
 * a session on the other. Sessions whose instance stopped heart-beating fall
 * out of {@link #getOperators} after {@code app.ha.presence.ttl-seconds}.
 */
@Component
@Slf4j
public class OperatorPresenceTracker {

    public record OperatorInfo(UUID userId, String name, String initials) {}

    private final OperatorPresenceStore store;
    private final InstanceIdentity instance;
    private final Duration ttl;
    private final Object ownershipLock = new Object();
    private final Map<String, OperatorPresenceStore.OwnedSession> owned = new LinkedHashMap<>();

    public OperatorPresenceTracker(OperatorPresenceStore store, InstanceIdentity instance, HaProperties haProperties) {
        this.store = store;
        this.instance = instance;
        this.ttl = Duration.ofSeconds(haProperties.getPresence().getTtlSeconds());
    }

    /** Per-process tracker; used by unit tests. */
    public OperatorPresenceTracker() {
        this(new InMemoryOperatorPresenceStore(), new InstanceIdentity("local"), new HaProperties());
    }

    public void register(String sessionId, UUID gameId, UUID userId, String name) {
        synchronized (ownershipLock) {
            owned.put(sessionId, new OperatorPresenceStore.OwnedSession(sessionId, gameId, userId, name));
            store.register(sessionId, instance.id(), gameId, userId, name, Instant.now());
        }
        log.info("Operator {} joined game {} (session {})", name, gameId, sessionId);
    }

    public UUID unregister(String sessionId) {
        UUID gameId;
        synchronized (ownershipLock) {
            OperatorPresenceStore.OwnedSession local = owned.remove(sessionId);
            gameId = store.unregister(sessionId).orElse(local == null ? null : local.gameId());
        }
        if (gameId != null) {
            log.info("Operator session {} left game {}", sessionId, gameId);
        }
        return gameId;
    }

    /** Re-asserts every session this instance owns; returns how many were written. */
    public int heartbeat() {
        synchronized (ownershipLock) {
            if (owned.isEmpty()) {
                return 0;
            }
            List<OperatorPresenceStore.OwnedSession> snapshot = new ArrayList<>(owned.values());
            return store.refresh(instance.id(), snapshot, Instant.now());
        }
    }

    /** Sessions this instance currently owns (for diagnostics and tests). */
    public int ownedSessionCount() {
        synchronized (ownershipLock) {
            return owned.size();
        }
    }

    public Set<OperatorInfo> getOperators(UUID gameId) {
        Instant activeSince = Instant.now().minus(ttl);
        Set<OperatorInfo> result = new LinkedHashSet<>();
        for (OperatorPresenceStore.PresentOperator op : store.present(gameId, activeSince)) {
            result.add(new OperatorInfo(op.userId(), op.name(), computeInitials(op.name())));
        }
        return java.util.Collections.unmodifiableSet(result);
    }

    static String computeInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.trim().split("\\s+");
        if (parts.length >= 2) {
            return ("" + parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
        }
        return parts[0].substring(0, 1).toUpperCase();
    }
}
