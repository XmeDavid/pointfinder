package com.prayer.pointfinder.service.ratelimit;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * PostgreSQL-backed store shared by every instance.
 *
 * <p>Each hit is one {@code INSERT ... ON CONFLICT DO UPDATE ... RETURNING}
 * statement: the conflict branch takes the row lock, so concurrent hits on
 * one bucket serialise and every increment counts. Window and lockout resets
 * are computed inside the same statement from the stored row and the
 * caller's clock, so the read-modify-write never leaves the database.
 *
 * <p>All statements run in {@code REQUIRES_NEW}: a failed login is recorded
 * even though the surrounding login transaction rolls back, and a successful
 * reset is not undone by a later failure in the caller.
 *
 * <p>Database errors propagate as {@link DataAccessException}. Callers treat
 * that as "cannot decide" and refuse the request rather than allowing it, so
 * an unavailable store never silently disables protection.
 */
public class JdbcRateLimitStore implements RateLimitStore {

    /**
     * {@code ?} order: scope, key, now, max, max, now, lockoutSeconds, now,
     * then windowSeconds three times (one per CASE), then max, max,
     * lockoutSeconds. Every CASE repeats the same "window expired or lockout
     * over" test because PostgreSQL has no way to name it once inside a
     * single UPDATE.
     */
    private static final String HIT_SQL = """
            INSERT INTO rate_limit_buckets (scope, bucket_key, window_start, hit_count, locked_until, updated_at)
            VALUES (?, ?, CAST(? AS timestamptz), 1,
                    CASE WHEN ? > 0 AND 1 >= ? THEN CAST(? AS timestamptz) + make_interval(secs => ?) ELSE NULL END,
                    CAST(? AS timestamptz))
            ON CONFLICT (scope, bucket_key) DO UPDATE SET
                hit_count = CASE
                    WHEN rate_limit_buckets.window_start + make_interval(secs => ?) < EXCLUDED.updated_at
                      OR (rate_limit_buckets.locked_until IS NOT NULL
                          AND rate_limit_buckets.locked_until <= EXCLUDED.updated_at)
                    THEN 1
                    ELSE rate_limit_buckets.hit_count + 1 END,
                window_start = CASE
                    WHEN rate_limit_buckets.window_start + make_interval(secs => ?) < EXCLUDED.updated_at
                      OR (rate_limit_buckets.locked_until IS NOT NULL
                          AND rate_limit_buckets.locked_until <= EXCLUDED.updated_at)
                    THEN EXCLUDED.updated_at
                    ELSE rate_limit_buckets.window_start END,
                locked_until = CASE
                    WHEN rate_limit_buckets.window_start + make_interval(secs => ?) < EXCLUDED.updated_at
                      OR (rate_limit_buckets.locked_until IS NOT NULL
                          AND rate_limit_buckets.locked_until <= EXCLUDED.updated_at)
                    THEN NULL
                    WHEN rate_limit_buckets.locked_until IS NOT NULL
                    THEN rate_limit_buckets.locked_until
                    WHEN ? > 0 AND rate_limit_buckets.hit_count + 1 >= ?
                    THEN EXCLUDED.updated_at + make_interval(secs => ?)
                    ELSE NULL END,
                updated_at = EXCLUDED.updated_at
            RETURNING hit_count, window_start, locked_until
            """;

    private final JdbcTemplate jdbc;
    private final TransactionTemplate requiresNew;

    public JdbcRateLimitStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.requiresNew = new TransactionTemplate(transactionManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    @Override
    public Bucket hit(String scope, String key, Duration window, Instant now) {
        return hit(scope, key, window, 0, null, now);
    }

    @Override
    public Bucket hit(String scope, String key, Duration window, int maxHits, Duration lockout, Instant now) {
        Timestamp nowTs = Timestamp.from(now);
        double windowSeconds = window.toMillis() / 1000.0;
        double lockoutSeconds = lockout == null ? 0 : lockout.toMillis() / 1000.0;
        int max = lockout == null ? 0 : maxHits;
        return requiresNew.execute(status -> {
            List<Bucket> rows = jdbc.query(HIT_SQL, JdbcRateLimitStore::mapBucket,
                    scope, key, nowTs,
                    max, max, nowTs, lockoutSeconds,
                    nowTs,
                    windowSeconds,
                    windowSeconds,
                    windowSeconds,
                    max, max, lockoutSeconds);
            return rows.get(0);
        });
    }

    @Override
    public Optional<Bucket> get(String scope, String key) {
        List<Bucket> rows = jdbc.query("""
                SELECT hit_count, window_start, locked_until
                  FROM rate_limit_buckets WHERE scope = ? AND bucket_key = ?
                """, JdbcRateLimitStore::mapBucket, scope, key);
        return rows.stream().findFirst();
    }

    @Override
    public void reset(String scope, String key) {
        requiresNew.executeWithoutResult(status ->
                jdbc.update("DELETE FROM rate_limit_buckets WHERE scope = ? AND bucket_key = ?", scope, key));
    }

    @Override
    public int deleteStale(Instant olderThan, int limit) {
        Integer deleted = requiresNew.execute(status -> jdbc.update("""
                DELETE FROM rate_limit_buckets
                 WHERE ctid IN (SELECT ctid FROM rate_limit_buckets WHERE updated_at < ? LIMIT ?)
                """, Timestamp.from(olderThan), limit));
        return deleted == null ? 0 : deleted;
    }

    private static Bucket mapBucket(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new Bucket(
                rs.getInt(1),
                rs.getTimestamp(2).toInstant(),
                rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant());
    }
}
