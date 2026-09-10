package com.prayer.pointfinder.realtime;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Plain JDBC access to {@code realtime_outbox} and
 * {@code realtime_outbox_cursors}. Inserts join whatever transaction the
 * caller is in; reads run as issued.
 */
@Repository
public class RealtimeOutboxRepository {

    public static final String NOTIFY_CHANNEL = "realtime_outbox";

    /** Transaction-id window from {@code pg_current_snapshot()}: every xid below {@code xmin} has finished. */
    public record Snapshot(long xmin, long xmax) {}

    public record Row(long id, long txId, String originInstance, UUID gameId, String audience, UUID teamId,
                      String type, String payloadJson, Instant createdAt) {}

    private final JdbcTemplate jdbc;

    public RealtimeOutboxRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Inserts one row in the current transaction and queues a NOTIFY that fires on commit. */
    public long insert(String originInstance, RealtimeEvent event, String payloadJson) {
        Long id = jdbc.queryForObject("""
                INSERT INTO realtime_outbox (origin_instance, game_id, audience, team_id, event_type, destination, payload)
                VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb))
                RETURNING id
                """, Long.class,
                originInstance, event.gameId(), event.audience().name(), event.teamId(),
                event.type(), event.destination(), payloadJson);
        jdbc.queryForObject("SELECT pg_notify(?, ?)", String.class, NOTIFY_CHANNEL, event.gameId().toString());
        return id == null ? -1L : id;
    }

    public Snapshot snapshot() {
        return jdbc.queryForObject("""
                SELECT pg_snapshot_xmin(s)::text::bigint, pg_snapshot_xmax(s)::text::bigint
                  FROM pg_current_snapshot() s
                """, (rs, i) -> new Snapshot(rs.getLong(1), rs.getLong(2)));
    }

    /**
     * Visible rows with {@code fromTxInclusive <= tx_id < toTxExclusive} and
     * {@code id > afterId}, in id order, at most {@code limit}.
     *
     * <p>The transaction-id window is what makes the cursor safe; the id
     * order is what makes delivery order meaningful. A row is inserted after
     * its transaction bumped the game's {@code state_version} under the game
     * row lock, so for one game a higher id always carries a higher version,
     * whereas transaction ids are assigned at transaction start and say
     * nothing about which bump came first.
     */
    public List<Row> fetch(long fromTxInclusive, long toTxExclusive, long afterId, int limit) {
        return jdbc.query("""
                SELECT id, tx_id, origin_instance, game_id, audience, team_id, event_type, payload::text, created_at
                  FROM realtime_outbox
                 WHERE tx_id >= ? AND tx_id < ?
                   AND id > ?
                 ORDER BY id
                 LIMIT ?
                """,
                (rs, i) -> new Row(
                        rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getObject(4, UUID.class),
                        rs.getString(5), rs.getObject(6, UUID.class), rs.getString(7), rs.getString(8),
                        rs.getTimestamp(9).toInstant()),
                fromTxInclusive, toTxExclusive, afterId, limit);
    }

    public Optional<Long> loadCursor(String instanceId) {
        List<Long> rows = jdbc.query("SELECT tx_id FROM realtime_outbox_cursors WHERE instance_id = ?",
                (rs, i) -> rs.getLong(1), instanceId);
        return rows.stream().findFirst();
    }

    public void saveCursor(String instanceId, long txId) {
        jdbc.update("""
                INSERT INTO realtime_outbox_cursors (instance_id, tx_id, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT (instance_id) DO UPDATE SET tx_id = EXCLUDED.tx_id, updated_at = EXCLUDED.updated_at
                """, instanceId, txId, Timestamp.from(Instant.now()));
    }

    /** Records a row this instance failed to deliver before it aged out of retention. */
    public void insertDeadLetter(String instanceId, Row row, int attempts, String lastError) {
        jdbc.update("""
                INSERT INTO realtime_outbox_dead_letters
                    (outbox_id, instance_id, game_id, audience, team_id, event_type, payload, attempts, last_error, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?)
                ON CONFLICT (outbox_id, instance_id) DO NOTHING
                """, row.id(), instanceId, row.gameId(), row.audience(), row.teamId(), row.type(),
                row.payloadJson(), attempts, lastError, Timestamp.from(row.createdAt()));
    }

    public long countDeadLetters(String instanceId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM realtime_outbox_dead_letters WHERE instance_id = ?", Long.class, instanceId);
        return n == null ? 0 : n;
    }

    public int deleteDeadLettersOlderThan(Instant olderThan) {
        return jdbc.update("DELETE FROM realtime_outbox_dead_letters WHERE dead_lettered_at < ?", Timestamp.from(olderThan));
    }

    public int deleteOlderThan(Instant olderThan, int limit) {
        return jdbc.update("""
                DELETE FROM realtime_outbox
                 WHERE ctid IN (SELECT ctid FROM realtime_outbox WHERE created_at < ? LIMIT ?)
                """, Timestamp.from(olderThan), limit);
    }

    public int deleteCursorsOlderThan(Instant olderThan) {
        return jdbc.update("DELETE FROM realtime_outbox_cursors WHERE updated_at < ?", Timestamp.from(olderThan));
    }

    /** Test helper: total rows. */
    public long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM realtime_outbox", Long.class);
        return n == null ? 0 : n;
    }
}
