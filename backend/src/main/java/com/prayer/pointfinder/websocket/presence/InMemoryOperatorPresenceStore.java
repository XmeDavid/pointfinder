package com.prayer.pointfinder.websocket.presence;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-process presence. The pre-HA behaviour, kept as the
 * {@code app.ha.presence.store=memory} rollback path and for unit tests.
 * With two instances each one only sees its own operators.
 */
public class InMemoryOperatorPresenceStore implements OperatorPresenceStore {

    private record Session(String instanceId, UUID gameId, UUID userId, String name, Instant lastSeen) {}

    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    @Override
    public void register(String sessionId, String instanceId, UUID gameId, UUID userId, String name, Instant now) {
        sessions.put(sessionId, new Session(instanceId, gameId, userId, name, now));
    }

    @Override
    public Optional<UUID> unregister(String sessionId) {
        Session removed = sessions.remove(sessionId);
        return removed == null ? Optional.empty() : Optional.of(removed.gameId);
    }

    @Override
    public List<PresentOperator> present(UUID gameId, Instant activeSince) {
        Map<UUID, PresentOperator> byUser = new LinkedHashMap<>();
        sessions.values().stream()
                .filter(s -> s.gameId.equals(gameId) && !s.lastSeen.isBefore(activeSince))
                .forEach(s -> byUser.putIfAbsent(s.userId, new PresentOperator(s.userId, s.name)));
        return new ArrayList<>(byUser.values());
    }

    @Override
    public int refresh(String instanceId, java.util.Collection<OwnedSession> owned, Instant now) {
        for (OwnedSession o : owned) {
            sessions.put(o.sessionId(), new Session(instanceId, o.gameId(), o.userId(), o.name(), now));
        }
        return owned.size();
    }

    @Override
    public List<UUID> expire(Instant olderThan, int limit) {
        List<UUID> games = new ArrayList<>();
        int removed = 0;
        for (Map.Entry<String, Session> e : new ArrayList<>(sessions.entrySet())) {
            if (removed >= limit) break;
            if (e.getValue().lastSeen.isBefore(olderThan) && sessions.remove(e.getKey()) != null) {
                removed++;
                if (!games.contains(e.getValue().gameId)) games.add(e.getValue().gameId);
            }
        }
        return games;
    }

    @Override
    public List<UUID> removeInstance(String instanceId) {
        List<UUID> games = new ArrayList<>();
        for (Map.Entry<String, Session> e : new ArrayList<>(sessions.entrySet())) {
            if (e.getValue().instanceId.equals(instanceId) && sessions.remove(e.getKey()) != null
                    && !games.contains(e.getValue().gameId)) {
                games.add(e.getValue().gameId);
            }
        }
        return games;
    }
}
