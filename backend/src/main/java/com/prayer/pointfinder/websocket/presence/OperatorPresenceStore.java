package com.prayer.pointfinder.websocket.presence;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Where operator presence sessions live. One entry per STOMP session that
 * subscribed to a game topic; the owning instance refreshes its sessions on
 * a heartbeat and the reader ignores sessions not refreshed since
 * {@code activeSince}.
 */
public interface OperatorPresenceStore {

    record PresentOperator(UUID userId, String name) {}

    /** A session this instance owns; the heartbeat re-asserts each one. */
    record OwnedSession(String sessionId, UUID gameId, UUID userId, String name) {}

    /** Upserts the session. Re-registering the same session id is idempotent. */
    void register(String sessionId, String instanceId, UUID gameId, UUID userId, String name, Instant now);

    /** Removes the session and returns the game it belonged to, if it was known. */
    Optional<UUID> unregister(String sessionId);

    /** Distinct operators with at least one session in {@code gameId} refreshed at or after {@code activeSince}. */
    List<PresentOperator> present(UUID gameId, Instant activeSince);

    /**
     * Re-asserts every session in {@code sessions} for {@code instanceId}:
     * inserts rows that are missing (expired during a pause or a database
     * outage while the socket stayed open) and refreshes the rest. Returns
     * the number written.
     */
    int refresh(String instanceId, java.util.Collection<OwnedSession> sessions, Instant now);

    /** Deletes sessions last seen before {@code olderThan}, at most {@code limit}; returns the distinct games affected. */
    List<UUID> expire(Instant olderThan, int limit);

    /** Deletes every session owned by {@code instanceId} (graceful shutdown); returns the distinct games affected. */
    List<UUID> removeInstance(String instanceId);
}
