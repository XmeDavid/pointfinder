package com.prayer.pointfinder.service;

import com.prayer.pointfinder.service.ratelimit.InMemoryRateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStoreUnavailableException;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Caps how often one account may change public listings: summary edits,
 * listing and delisting. The ceiling is well above any hand-driven use so a
 * legitimate operator never meets it, while an account that flips a game's
 * visibility in a loop is stopped and shows up in the log.
 */
@Service
public class PublicationRateLimiter {

    static final int MAX_MUTATIONS = 60;
    static final Duration WINDOW = Duration.ofHours(1);
    static final String SCOPE = "publication_user";

    private final RateLimitStore store;

    public PublicationRateLimiter(RateLimitStore store) {
        this.store = store;
    }

    /** Per-process limiter; used by unit tests of the policy. */
    public PublicationRateLimiter() {
        this(new InMemoryRateLimitStore());
    }

    /** Counts one mutation for the account and says whether it may proceed. */
    public boolean tryAcquire(UUID userId) {
        try {
            return store.hit(SCOPE, userId.toString(), WINDOW, Instant.now()).count() <= MAX_MUTATIONS;
        } catch (DataAccessException ex) {
            throw new RateLimitStoreUnavailableException("Publication limiter unavailable", ex);
        }
    }

    // visible for testing
    public void clear() {
        if (store instanceof InMemoryRateLimitStore memory) {
            memory.clear();
        }
    }
}
