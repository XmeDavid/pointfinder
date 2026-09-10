package com.prayer.pointfinder.service;

import com.prayer.pointfinder.service.ratelimit.InMemoryRateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStore;
import com.prayer.pointfinder.service.ratelimit.RateLimitStoreUnavailableException;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

/**
 * Login brute-force limiter. Blocks an email after {@link #MAX_ATTEMPTS}
 * failures inside {@link #BLOCK_DURATION_MINUTES} of the first failure; a
 * successful login clears the record.
 *
 * <p>State lives in the shared {@link RateLimitStore}, so two active backends
 * see one allowance per email and the count survives a restart. The store
 * writes in its own transaction: a failed login is recorded even though the
 * login transaction that observed it rolls back. If the store cannot answer,
 * the limiter refuses the login rather than allowing it.
 */
@Service
public class LoginAttemptService {

    static final int MAX_ATTEMPTS = 10;
    static final long BLOCK_DURATION_MINUTES = 15;
    static final String SCOPE = "login";

    private static final Duration WINDOW = Duration.ofMinutes(BLOCK_DURATION_MINUTES);

    private final RateLimitStore store;

    public LoginAttemptService(RateLimitStore store) {
        this.store = store;
    }

    /** Per-process limiter; used by unit tests of the policy. */
    public LoginAttemptService() {
        this(new InMemoryRateLimitStore());
    }

    public boolean isBlocked(String email) {
        String key = normalize(email);
        Instant now = Instant.now();
        try {
            return store.get(SCOPE, key)
                    .filter(bucket -> !bucket.windowExpired(now, WINDOW))
                    .map(bucket -> bucket.count() >= MAX_ATTEMPTS)
                    .orElse(false);
        } catch (DataAccessException ex) {
            throw new RateLimitStoreUnavailableException("Login limiter unavailable", ex);
        }
    }

    public void recordFailure(String email) {
        try {
            store.hit(SCOPE, normalize(email), WINDOW, Instant.now());
        } catch (DataAccessException ex) {
            throw new RateLimitStoreUnavailableException("Login limiter unavailable", ex);
        }
    }

    public void recordSuccess(String email) {
        try {
            store.reset(SCOPE, normalize(email));
        } catch (DataAccessException ex) {
            throw new RateLimitStoreUnavailableException("Login limiter unavailable", ex);
        }
    }

    // visible for testing
    int getAttemptCount(String email) {
        Instant now = Instant.now();
        return store.get(SCOPE, normalize(email))
                .filter(bucket -> !bucket.windowExpired(now, WINDOW))
                .map(RateLimitStore.Bucket::count)
                .orElse(0);
    }

    // visible for testing
    void clear() {
        if (store instanceof InMemoryRateLimitStore memory) {
            memory.clear();
        }
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
