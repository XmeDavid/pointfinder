package com.prayer.pointfinder.websocket;

import com.prayer.pointfinder.service.ratelimit.InMemoryRateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

/**
 * Per-IP brute-force throttle for broadcast-code STOMP authentication.
 *
 * <p>Broadcast codes are short tokens with a reduced alphabet. Without a
 * throttle an attacker could try the address space in minutes. An IP is
 * locked out for {@link #LOCKOUT_DURATION} once it fails
 * {@link #MAX_FAILED_ATTEMPTS} times inside {@link #ATTEMPT_WINDOW}; a
 * successful code clears the record. Every failure logs at WARN so the rate
 * shows up in observability.
 *
 * <p>Counters live in the shared {@link RateLimitStore}, so alternating
 * attempts between two backends do not multiply the allowance. A store error
 * denies the connection rather than allowing it.
 */
@Slf4j
@Component
public class BroadcastCodeThrottle {

    static final int MAX_FAILED_ATTEMPTS = 5;
    static final Duration ATTEMPT_WINDOW = Duration.ofMinutes(1);
    static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);
    static final String SCOPE = "broadcast_code";

    private final RateLimitStore store;

    public BroadcastCodeThrottle(RateLimitStore store) {
        this.store = store;
    }

    /** Per-process throttle; used by unit tests of the policy. */
    public BroadcastCodeThrottle() {
        this(new InMemoryRateLimitStore());
    }

    /** Throws {@link AccessDeniedException} when the IP is currently locked out. */
    public void enforce(String remoteIp) {
        Instant now = Instant.now();
        RateLimitStore.Bucket state;
        try {
            state = store.get(SCOPE, remoteIp).orElse(null);
        } catch (DataAccessException ex) {
            log.error("Broadcast-code throttle store unavailable for ip={}: {}", remoteIp, ex.getMessage());
            throw new AccessDeniedException("Broadcast-code authentication temporarily unavailable");
        }
        if (state != null && state.locked(now)) {
            log.warn("Broadcast-code auth blocked: ip={} locked_until={} (attempts={})",
                    remoteIp, state.lockedUntil(), state.count());
            throw new AccessDeniedException("Too many invalid broadcast-code attempts");
        }
    }

    public void recordFailure(String remoteIp) {
        RateLimitStore.Bucket updated;
        try {
            updated = store.hit(SCOPE, remoteIp, ATTEMPT_WINDOW, MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION, Instant.now());
        } catch (DataAccessException ex) {
            log.error("Broadcast-code throttle store unavailable for ip={}: {}", remoteIp, ex.getMessage());
            return;
        }
        // Never log the attempted code: it could be valid for another game.
        log.warn("Broadcast-code auth failed: ip={} attempts={} locked_until={}",
                remoteIp, updated.count(), updated.lockedUntil());
    }

    /** A valid code resets the per-IP counter so a viewer who miskeyed once is not punished indefinitely. */
    public void recordSuccess(String remoteIp) {
        try {
            store.reset(SCOPE, remoteIp);
        } catch (DataAccessException ex) {
            log.warn("Broadcast-code throttle reset failed for ip={}: {}", remoteIp, ex.getMessage());
        }
    }
}
