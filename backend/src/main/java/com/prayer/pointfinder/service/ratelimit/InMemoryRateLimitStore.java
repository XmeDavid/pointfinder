package com.prayer.pointfinder.service.ratelimit;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-process store. This is the pre-HA behaviour, kept as the
 * {@code app.ha.rate-limit.store=memory} rollback path and for unit tests of
 * limiter policy. Not safe for two active instances: each process has its
 * own allowance.
 */
public class InMemoryRateLimitStore implements RateLimitStore {

    private record Entry(Bucket bucket, Instant updatedAt) {}

    private final Map<String, Entry> buckets = new ConcurrentHashMap<>();

    @Override
    public Bucket hit(String scope, String key, Duration window, Instant now) {
        return hit(scope, key, window, 0, null, now);
    }

    @Override
    public Bucket hit(String scope, String key, Duration window, int maxHits, Duration lockout, Instant now) {
        Entry updated = buckets.compute(id(scope, key), (k, prev) -> {
            if (prev == null
                    || prev.bucket.windowExpired(now, window)
                    || (prev.bucket.lockedUntil() != null && !prev.bucket.locked(now))) {
                return new Entry(new Bucket(1, now, lockedUntilFor(1, maxHits, lockout, now)), now);
            }
            int next = prev.bucket.count() + 1;
            Instant lockedUntil = prev.bucket.lockedUntil() != null
                    ? prev.bucket.lockedUntil()
                    : lockedUntilFor(next, maxHits, lockout, now);
            return new Entry(new Bucket(next, prev.bucket.windowStart(), lockedUntil), now);
        });
        return updated.bucket;
    }

    private static Instant lockedUntilFor(int count, int maxHits, Duration lockout, Instant now) {
        if (maxHits > 0 && lockout != null && count >= maxHits) {
            return now.plus(lockout);
        }
        return null;
    }

    @Override
    public Optional<Bucket> get(String scope, String key) {
        Entry e = buckets.get(id(scope, key));
        return e == null ? Optional.empty() : Optional.of(e.bucket);
    }

    @Override
    public void reset(String scope, String key) {
        buckets.remove(id(scope, key));
    }

    @Override
    public int deleteStale(Instant olderThan, int limit) {
        int[] removed = {0};
        buckets.entrySet().removeIf(e -> {
            if (removed[0] < limit && e.getValue().updatedAt.isBefore(olderThan)) {
                removed[0]++;
                return true;
            }
            return false;
        });
        return removed[0];
    }

    /** Test helper. */
    public void clear() {
        buckets.clear();
    }

    private static String id(String scope, String key) {
        return scope + " " + key;
    }
}
