package com.prayer.pointfinder.service.ratelimit;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Fixed-window counters shared by the login, player-join and broadcast-code
 * limiters. Implementations must make {@link #hit} atomic under concurrent
 * callers: two simultaneous hits on the same bucket yield counts 1 and 2,
 * never 1 and 1.
 *
 * <p>A window starts at the first hit and lasts {@code window}; a hit after
 * the window has passed opens a fresh window with count 1. Optional lockout:
 * when {@code maxHits} and {@code lockout} are given, the hit that reaches
 * {@code maxHits} sets {@code lockedUntil = now + lockout}; a hit after the
 * lockout has passed also opens a fresh window.
 */
public interface RateLimitStore {

    record Bucket(int count, Instant windowStart, Instant lockedUntil) {
        public boolean windowExpired(Instant now, Duration window) {
            return now.isAfter(windowStart.plus(window));
        }
        public boolean locked(Instant now) {
            return lockedUntil != null && now.isBefore(lockedUntil);
        }
    }

    /** Records one hit and returns the bucket state after it. */
    Bucket hit(String scope, String key, Duration window, Instant now);

    /** Records one hit with lockout semantics and returns the bucket state after it. */
    Bucket hit(String scope, String key, Duration window, int maxHits, Duration lockout, Instant now);

    /** Current state without recording a hit. Expired windows are still returned; callers check. */
    Optional<Bucket> get(String scope, String key);

    /** Forgets the bucket (successful login, valid broadcast code). */
    void reset(String scope, String key);

    /** Deletes buckets not updated since {@code olderThan}; returns rows removed. Bounded per call. */
    int deleteStale(Instant olderThan, int limit);
}
