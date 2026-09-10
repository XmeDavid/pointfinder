package com.prayer.pointfinder.websocket.presence;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Presence rows in {@code operator_presence}, shared by every instance.
 * Writes run in {@code REQUIRES_NEW} so a STOMP event handler's outcome never
 * depends on an enclosing transaction (there is none today; this keeps it so).
 */
public class JdbcOperatorPresenceStore implements OperatorPresenceStore {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate requiresNew;

    public JdbcOperatorPresenceStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Override
    public void register(String sessionId, String instanceId, UUID gameId, UUID userId, String name, Instant now) {
        Timestamp ts = Timestamp.from(now);
        requiresNew.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO operator_presence (session_id, instance_id, game_id, user_id, user_name, connected_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (session_id) DO UPDATE SET
                    instance_id = EXCLUDED.instance_id,
                    game_id = EXCLUDED.game_id,
                    user_id = EXCLUDED.user_id,
                    user_name = EXCLUDED.user_name,
                    last_seen_at = EXCLUDED.last_seen_at
                """, sessionId, instanceId, gameId, userId, name, ts, ts));
    }

    @Override
    public Optional<UUID> unregister(String sessionId) {
        List<UUID> games = requiresNew.execute(status -> jdbc.query(
                "DELETE FROM operator_presence WHERE session_id = ? RETURNING game_id",
                (rs, i) -> rs.getObject(1, UUID.class), sessionId));
        return games == null ? Optional.empty() : games.stream().findFirst();
    }

    @Override
    public List<PresentOperator> present(UUID gameId, Instant activeSince) {
        return jdbc.query("""
                SELECT user_id, MIN(user_name) AS user_name, MIN(connected_at) AS first_seen
                  FROM operator_presence
                 WHERE game_id = ? AND last_seen_at >= ?
                 GROUP BY user_id
                 ORDER BY first_seen, user_id
                """,
                (rs, i) -> new PresentOperator(rs.getObject(1, UUID.class), rs.getString(2)),
                gameId, Timestamp.from(activeSince));
    }

    @Override
    public int refresh(String instanceId, java.util.Collection<OwnedSession> owned, Instant now) {
        if (owned.isEmpty()) {
            return 0;
        }
        Timestamp ts = Timestamp.from(now);
        List<Object[]> batch = owned.stream()
                .map(o -> new Object[] {o.sessionId(), instanceId, o.gameId(), o.userId(), o.name(), ts, ts})
                .toList();
        int[] written = requiresNew.execute(status -> jdbc.batchUpdate("""
                INSERT INTO operator_presence (session_id, instance_id, game_id, user_id, user_name, connected_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (session_id) DO UPDATE SET
                    instance_id = EXCLUDED.instance_id,
                    last_seen_at = EXCLUDED.last_seen_at
                """, batch));
        return written == null ? 0 : written.length;
    }

    @Override
    public List<UUID> expire(Instant olderThan, int limit) {
        return requiresNew.execute(status -> jdbc.query("""
                WITH gone AS (
                    DELETE FROM operator_presence
                     WHERE session_id IN (
                         SELECT session_id FROM operator_presence WHERE last_seen_at < ? LIMIT ?)
                    RETURNING game_id)
                SELECT DISTINCT game_id FROM gone
                """, (rs, i) -> rs.getObject(1, UUID.class), Timestamp.from(olderThan), limit));
    }

    @Override
    public List<UUID> removeInstance(String instanceId) {
        return requiresNew.execute(status -> jdbc.query("""
                WITH gone AS (
                    DELETE FROM operator_presence WHERE instance_id = ? RETURNING game_id)
                SELECT DISTINCT game_id FROM gone
                """, (rs, i) -> rs.getObject(1, UUID.class), instanceId));
    }
}
